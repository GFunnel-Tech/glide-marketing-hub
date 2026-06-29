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

// ---------- Custom field discovery & creation ----------

export type GhlCustomField = { id: string; name: string; fieldKey?: string; dataType?: string };

const _cfCache = new Map<string, { at: number; fields: GhlCustomField[] }>();
const CF_TTL_MS = 5 * 60_000;

function normKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/^contact\./, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function fetchLocationCustomFields(
  apiKey: string,
  locationId: string,
): Promise<GhlCustomField[]> {
  if (!isPit(apiKey) || !locationId) return [];
  const cacheKey = `${locationId}:${apiKey.slice(-8)}`;
  const hit = _cfCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CF_TTL_MS) return hit.fields;

  const res = await fetch(
    `${V2_BASE}/locations/${encodeURIComponent(locationId)}/customFields`,
    { headers: v2Headers(apiKey, locationId) },
  );
  if (!res.ok) return [];
  const j = await res.json().catch(() => ({} as any));
  const raw: any[] = j.customFields ?? j.data ?? [];
  const fields: GhlCustomField[] = raw.map((f) => ({
    id: String(f.id),
    name: f.name ?? f.fieldKey ?? "",
    fieldKey: f.fieldKey,
    dataType: f.dataType,
  }));
  _cfCache.set(cacheKey, { at: Date.now(), fields });
  return fields;
}

async function createLocationCustomField(
  apiKey: string,
  locationId: string,
  name: string,
): Promise<GhlCustomField | null> {
  try {
    const res = await fetch(
      `${V2_BASE}/locations/${encodeURIComponent(locationId)}/customFields`,
      {
        method: "POST",
        headers: { ...v2Headers(apiKey, locationId), "Content-Type": "application/json" },
        body: JSON.stringify({ name, dataType: "TEXT", model: "contact" }),
      },
    );
    if (!res.ok) return null;
    const j = await res.json().catch(() => ({} as any));
    const f = j.customField ?? j;
    if (!f?.id) return null;
    _cfCache.delete(`${locationId}:${apiKey.slice(-8)}`);
    return { id: String(f.id), name: f.name ?? name, fieldKey: f.fieldKey };
  } catch { return null; }
}

// Ensure the 5 standard meta_* fields exist; returns the up-to-date field list.
export async function ensureMetaCustomFields(
  apiKey: string,
  locationId: string,
): Promise<GhlCustomField[]> {
  if (!isPit(apiKey) || !locationId) return [];
  let fields = await fetchLocationCustomFields(apiKey, locationId);
  const desired = ["Meta Campaign", "Meta Adset", "Meta Ad", "Meta Form", "Meta Lead ID"];
  const haveKeys = new Set(fields.map((f) => normKey(f.fieldKey || f.name)));
  for (const name of desired) {
    if (!haveKeys.has(normKey(name))) {
      const created = await createLocationCustomField(apiKey, locationId, name);
      if (created) fields = [...fields, created];
    }
  }
  return fields;
}

function findFieldId(fields: GhlCustomField[], wanted: string): string | null {
  const w = normKey(wanted);
  const exact = fields.find((f) => normKey(f.fieldKey || "") === w || normKey(f.name) === w);
  if (exact) return exact.id;
  // fuzzy contains match
  const fuzzy = fields.find((f) =>
    normKey(f.fieldKey || "").includes(w) || normKey(f.name).includes(w)
  );
  return fuzzy?.id ?? null;
}

// Build a customFields[] array (V2) by mapping Meta form field_data answers
// onto the location's actual custom fields. Includes the standard meta_* meta.
export function buildCustomFieldsPayload(
  fields: GhlCustomField[],
  lead: { campaign_name?: string | null; adset_name?: string | null; ad_name?: string | null;
          form_name?: string | null; id: string; field_data?: any },
): Array<{ id: string; field_value: string }> {
  const out: Array<{ id: string; field_value: string }> = [];
  const push = (wanted: string, value: string | null | undefined) => {
    if (value == null || value === "") return;
    const id = findFieldId(fields, wanted);
    if (id) out.push({ id, field_value: String(value) });
  };

  push("meta_campaign", lead.campaign_name);
  push("meta_adset", lead.adset_name);
  push("meta_ad", lead.ad_name);
  push("meta_form", lead.form_name);
  push("meta_lead_id", lead.id);

  const fd = Array.isArray(lead.field_data) ? lead.field_data : [];
  const reserved = new Set(["full_name", "first_name", "last_name", "email", "phone", "phone_number"]);
  for (const item of fd) {
    const name = item?.name ?? item?.key;
    if (!name) continue;
    const key = normKey(String(name));
    if (reserved.has(key)) continue;
    const vals = item?.values ?? item?.value ?? [];
    const v = Array.isArray(vals) ? vals.join(", ") : String(vals ?? "");
    if (!v) continue;
    const id = findFieldId(fields, name);
    if (id) out.push({ id, field_value: v });
  }
  // De-dupe by id (last write wins)
  const dedup = new Map<string, { id: string; field_value: string }>();
  for (const cf of out) dedup.set(cf.id, cf);
  return Array.from(dedup.values());
}

export async function upsertGhlContact(
  apiKey: string,
  locationId: string | null | undefined,
  lead: { full_name?: string | null; email?: string | null; phone?: string | null;
          campaign_name?: string | null; adset_name?: string | null; ad_name?: string | null;
          form_name?: string | null; id: string; field_data?: any },
): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  try {
    const [firstName, ...rest] = (lead.full_name || "").split(" ");

    if (isPit(apiKey)) {
      if (!locationId) {
        return { ok: false, error: "Client has no GHL location mapped. Map it in Integrations → GHL Locations." };
      }
      // Ensure standard meta_* fields exist, then build the full payload from
      // the location's actual customFields (including Meta form answers).
      const fields = await ensureMetaCustomFields(apiKey, locationId);
      const customFields = buildCustomFieldsPayload(fields, lead);

      const body = {
        locationId,
        firstName: firstName || undefined,
        lastName: rest.join(" ") || undefined,
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        source: "Meta Lead Ads (recovery)",
        tags: ["meta-lead-recovery"],
        customFields,
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

    // V1 legacy — keyed custom fields (no ID lookup available without extra calls)
    const customField: Record<string, unknown> = {
      meta_campaign: lead.campaign_name,
      meta_adset: lead.adset_name,
      meta_ad: lead.ad_name,
      meta_form: lead.form_name,
      meta_lead_id: lead.id,
    };
    const fd = Array.isArray(lead.field_data) ? lead.field_data : [];
    for (const item of fd) {
      const name = item?.name ?? item?.key;
      if (!name) continue;
      const k = normKey(String(name));
      if (["full_name","first_name","last_name","email","phone","phone_number"].includes(k)) continue;
      const vals = item?.values ?? item?.value ?? [];
      const v = Array.isArray(vals) ? vals.join(", ") : String(vals ?? "");
      if (v) customField[k] = v;
    }
    const body: Record<string, unknown> = {
      firstName: firstName || undefined,
      lastName: rest.join(" ") || undefined,
      email: lead.email || undefined,
      phone: lead.phone || undefined,
      source: "Meta Lead Ads (recovery)",
      tags: ["meta-lead-recovery"],
      customField,
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
