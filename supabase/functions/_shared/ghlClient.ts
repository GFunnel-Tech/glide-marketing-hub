// Shared GHL helpers. Uses V2 API (services.leadconnectorhq.com) for PIT tokens
// (start with "pit-") and V1 (rest.gohighlevel.com) for legacy agency keys.

export const V2_BASE = "https://services.leadconnectorhq.com";
export const V1_BASE = "https://rest.gohighlevel.com/v1";
export const V2_VERSION = "2021-07-28";

export function isPit(apiKey: string): boolean {
  return !!apiKey && apiKey.trim().startsWith("pit-");
}

// Build a map of locationId -> sub-account PIT for a workspace.
// Lets us prefer a per-client (location-level) Private Integration Token
// over the workspace-wide agency key.
export async function fetchLocationKeyMap(
  admin: any,
  workspaceId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data } = await admin
      .from("ghl_locations")
      .select("location_id, location_api_key")
      .eq("workspace_id", workspaceId)
      .not("location_api_key", "is", null);
    for (const row of data ?? []) {
      if (row?.location_id && row?.location_api_key) {
        map.set(row.location_id, row.location_api_key);
      }
    }
  } catch {/* ignore — caller falls back to workspace key */}
  return map;
}

// Resolve the effective GHL key for a given client/location: prefer the
// location-level PIT when present, otherwise the workspace agency key.
export function resolveGhlKey(
  locKeyMap: Map<string, string> | null | undefined,
  locationId: string | null | undefined,
  workspaceKey: string | null | undefined,
): string | null {
  if (locationId && locKeyMap) {
    const k = locKeyMap.get(locationId);
    if (k) return k;
  }
  return workspaceKey || null;
}

function v2Headers(apiKey: string, locationId?: string | null) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Version: V2_VERSION,
    Accept: "application/json",
  };
  if (locationId) h["locationId"] = locationId;
  return h;
}

// Test the key against an endpoint that doesn't require a location.
// Returns { ok, status, message }.
export async function testGhlKey(apiKey: string): Promise<{ ok: boolean; status: number; message?: string }> {
  if (isPit(apiKey)) {
    const res = await fetch(`${V2_BASE}/oauth/userinfo`, { headers: v2Headers(apiKey) });
    if (res.ok) return { ok: true, status: res.status };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: (await res.text()).slice(0, 300) };
    }
    // Some PITs lack /oauth/userinfo scope — try /locations/search as a secondary signal
    const r2 = await fetch(`${V2_BASE}/locations/search?limit=1`, { headers: v2Headers(apiKey) });
    if (r2.ok || r2.status === 400 || r2.status === 422) return { ok: true, status: r2.status };
    return { ok: false, status: r2.status, message: (await r2.text()).slice(0, 300) };
  }
  // Legacy V1 agency key
  const res = await fetch(`${V1_BASE}/contacts/lookup?email=metahub-test@example.invalid`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: res.status, message: (await res.text()).slice(0, 300) };
  }
  return { ok: true, status: res.status };
}

export async function searchGhlContact(
  apiKey: string,
  locationId: string | null | undefined,
  email: string | null,
  phone: string | null,
): Promise<{ id: string } | null> {
  if (!email && !phone) return null;

  // Build multiple variants so format mismatches don't cause false misses.
  const variants: string[] = [];
  if (email) {
    const e = email.trim().toLowerCase();
    if (e) variants.push(e);
  }
  if (phone) {
    const digits = phone.replace(/\D+/g, "");
    if (digits) {
      variants.push(phone.trim());
      variants.push(digits);
      if (digits.length > 10) variants.push(digits.slice(-10));
      if (digits.length === 10) variants.push("+1" + digits);
    }
  }
  const tried = new Set<string>();

  if (isPit(apiKey)) {
    if (!locationId) return null;
    const tryOne = async (value: string) => {
      const url = `${V2_BASE}/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(value)}`;
      const res = await fetch(url, { headers: v2Headers(apiKey, locationId) });
      if (!res.ok) return null;
      const j = await res.json().catch(() => ({} as any));
      const contacts: any[] = j.contacts ?? j.data ?? [];
      const c = contacts[0];
      return c?.id ? { id: String(c.id) } : null;
    };
    for (const v of variants) {
      if (tried.has(v)) continue;
      tried.add(v);
      const m = await tryOne(v);
      if (m) return m;
    }
    return null;
  }

  const tryLookup = async (param: string, value: string) => {
    const url = `${V1_BASE}/contacts/lookup?${param}=${encodeURIComponent(value)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return null;
    const j = await res.json().catch(() => ({} as any));
    const contacts: any[] = j.contacts ?? [];
    const match = locationId ? contacts.find((c) => c.locationId === locationId) : contacts[0];
    return match?.id ? { id: String(match.id) } : null;
  };
  for (const v of variants) {
    if (tried.has(v)) continue;
    tried.add(v);
    const isEmail = v.includes("@");
    const m = await tryLookup(isEmail ? "email" : "phone", v);
    if (m) return m;
  }
  return null;
}

export async function upsertGhlContact(
  apiKey: string,
  locationId: string | null | undefined,
  lead: { full_name?: string | null; email?: string | null; phone?: string | null;
          campaign_name?: string | null; adset_name?: string | null; ad_name?: string | null;
          form_name?: string | null; id: string },
): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  try {
    const [firstName, ...rest] = (lead.full_name || "").split(" ");
    const customFieldsV2 = [
      { key: "meta_campaign", field_value: lead.campaign_name ?? "" },
      { key: "meta_adset", field_value: lead.adset_name ?? "" },
      { key: "meta_ad", field_value: lead.ad_name ?? "" },
      { key: "meta_form", field_value: lead.form_name ?? "" },
      { key: "meta_lead_id", field_value: lead.id },
    ];

    if (isPit(apiKey)) {
      if (!locationId) {
        return { ok: false, error: "Client has no GHL location mapped. Map it in Integrations → GHL Locations." };
      }
      const body = {
        locationId,
        firstName: firstName || undefined,
        lastName: rest.join(" ") || undefined,
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        source: "Meta Lead Ads (recovery)",
        tags: ["meta-lead-recovery"],
        customFields: customFieldsV2,
      };
      const res = await fetch(`${V2_BASE}/contacts/upsert`, {
        method: "POST",
        headers: { ...v2Headers(apiKey, locationId), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `GHL ${res.status}: ${text.slice(0, 300)}` };
      }
      const j = await res.json().catch(() => ({} as any));
      const id = j?.contact?.id || j?.id || "";
      return { ok: true, contactId: String(id) };
    }

    // V1
    const body: Record<string, unknown> = {
      firstName: firstName || undefined,
      lastName: rest.join(" ") || undefined,
      email: lead.email || undefined,
      phone: lead.phone || undefined,
      source: "Meta Lead Ads (recovery)",
      tags: ["meta-lead-recovery"],
      customField: {
        meta_campaign: lead.campaign_name,
        meta_adset: lead.adset_name,
        meta_ad: lead.ad_name,
        meta_form: lead.form_name,
        meta_lead_id: lead.id,
      },
    };
    if (locationId) (body as any).locationId = locationId;
    const res = await fetch(`${V1_BASE}/contacts/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `GHL ${res.status}: ${text.slice(0, 300)}` };
    }
    const j = await res.json().catch(() => ({} as any));
    const id = j?.contact?.id || j?.id || "";
    return { ok: true, contactId: String(id) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
