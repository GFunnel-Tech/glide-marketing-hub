import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export type ClientLifecycle = "prospect" | "client" | "churned";

export interface DbClient {
  id: number;
  name: string;
  brand: string;
  contact_name?: string | null;

  // Pre-sale vs paying vs former. Rows default to "client" in the database, so
  // anything predating the prospect model keeps its existing behaviour.
  website?: string | null;
  vertical?: string | null;

  pipeline_id?: string | null;
  pipeline_stage_id?: string | null;
  stage_entered_at?: string | null;

  lifecycle?: ClientLifecycle;
  decision_maker?: string | null;
  decision_maker_role?: string | null;
  decision_maker_email?: string | null;
  decision_maker_phone?: string | null;
  relationship_owner?: string | null;
  warm_path?: string | null;
  prospect_source?: string | null;
  converted_at?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;

  status: "GREEN" | "YELLOW" | "RED" | "BLOCKED" | "NEW" | "PENDING_APPROVAL" | "SETUP_COMPLETE" | "LAUNCHING" | "LEARNING" | "RELAUNCH" | "PAUSED" | "PENDING_CANCELLATION" | "CANCELLED";
  bm_type: "Own BM" | "Agency BM";
  cpl: number;
  cpm: number;
  leads: number;
  spend: number;
  form_cvr: number;
  frequency: number;
  double_count: boolean;
  true_cpl: number;
  reported_leads: number;
  true_leads: number;
  last_audit: string | null;
  bm_id?: string | null;
  bm_account_name?: string | null;
  ghl_location_id?: string | null;
  is_agency_account?: boolean | null;
}

export interface DbCampaign {
  id: string;
  client_id: number;
  name: string;
  status: "active" | "paused";
  spend: number;
  leads: number;
  true_leads: number;
  cpl: number;
  true_cpl: number;
  cpm: number;
  frequency: number;
  ad_sets: number;
  ads: number;
  double_count: boolean;
  issues_status?: string | null;
}

export interface DbReport {
  id: string;
  client_id: number;
  client_name: string;
  brand: string;
  month: string;
  status: "draft" | "ready" | "delivered";
  delivered_date: string | null;
  client_reviewed: boolean;
  metric_spend: number;
  metric_leads: number;
  metric_cpl: number;
  metric_appointments: number;
  metric_applications: number;
  metric_closed_deals: number;
  metric_pipeline_value: number;
}

export interface DbActivityLog {
  id: string;
  client_id: number;
  timestamp: string;
  author: string;
  action: string;
  result: string | null;
  type: string;
}

export interface DbOnboarding {
  id: string;
  client_id: number;
  name: string;
  brand: string;
  phase: number;
  days_in_phase: number;
  owner: string;
  blockers: string[];
}

export interface DbLead {
  id: string;
  client_id: number;
  name: string;
  date: string;
  stage: string;
  phone: string | null;
  status: string;
}

export interface DbTeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  access_level: string;
  member_status: string;
}

export type TeamMemberInput = {
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  access_level: string;
  member_status: string;
};

export function toClient(c: DbClient) {
  return {
    id: c.id,
    name: c.name,
    brand: c.brand,
    // Contact person ("Nick Smith") shown alongside the brand name.
    contact_name: (c as any).contact_name ?? null,
    contactName: (c as any).contact_name ?? null,
    status: c.status,

    bmType: c.bm_type,
    cpl: Number(c.cpl),
    cpm: Number(c.cpm),
    leads: c.leads,
    spend: Number(c.spend),
    formCvr: Number(c.form_cvr),
    frequency: Number(c.frequency),
    doubleCount: c.double_count,
    trueCpl: Number(c.true_cpl),
    reportedLeads: c.reported_leads,
    trueLeads: c.true_leads,
    lastAudit: c.last_audit || "",
    bmId: c.bm_id || "",
    bmAccountName: c.bm_account_name || "",
    ghlLocationId: c.ghl_location_id || null,
    autonomousOptimization: !!(c as any).autonomous_optimization,
    isAgencyAccount: !!c.is_agency_account,

    website: (c as any).website ?? null,
    vertical: (c as any).vertical ?? null,

    pipelineId: (c as any).pipeline_id ?? null,
    pipelineStageId: (c as any).pipeline_stage_id ?? null,
    stageEnteredAt: (c as any).stage_entered_at ?? null,

    lifecycle: ((c as any).lifecycle ?? "client") as ClientLifecycle,
    decisionMaker: (c as any).decision_maker ?? null,
    decisionMakerRole: (c as any).decision_maker_role ?? null,
    decisionMakerEmail: (c as any).decision_maker_email ?? null,
    decisionMakerPhone: (c as any).decision_maker_phone ?? null,
    relationshipOwner: (c as any).relationship_owner ?? null,
    warmPath: (c as any).warm_path ?? null,
    prospectSource: (c as any).prospect_source ?? null,
    convertedAt: (c as any).converted_at ?? null,
    lostAt: (c as any).lost_at ?? null,
    lostReason: (c as any).lost_reason ?? null,
  };
}

/** The shape every client query returns, prospects included. */
export type Client = ReturnType<typeof toClient>;

export function toCampaign(c: DbCampaign) {
  return {
    id: c.id,
    clientId: String(c.client_id),
    name: c.name,
    status: c.status as "active" | "paused",
    spend: Number(c.spend),
    leads: c.leads,
    trueLeads: c.true_leads,
    cpl: Number(c.cpl),
    trueCpl: Number(c.true_cpl),
    cpm: Number(c.cpm),
    frequency: Number(c.frequency),
    adSets: c.ad_sets,
    ads: c.ads,
    doubleCount: c.double_count,
    issuesStatus: c.issues_status ?? null,
  };
}

export function toReport(r: DbReport) {
  return {
    id: r.id,
    clientId: String(r.client_id),
    clientName: r.client_name,
    brand: r.brand,
    month: r.month,
    status: r.status as "draft" | "ready" | "delivered",
    deliveredDate: r.delivered_date,
    clientReviewed: r.client_reviewed,
    metrics: {
      spend: Number(r.metric_spend),
      leads: r.metric_leads,
      cpl: Number(r.metric_cpl),
      appointments: r.metric_appointments,
      applications: r.metric_applications,
      closedDeals: r.metric_closed_deals,
      pipelineValue: Number(r.metric_pipeline_value),
    },
  };
}

// Workspace-scoped fetch
async function fetchScoped<T>(table: string, workspaceId: string | null): Promise<T[]> {
  if (!workspaceId) return [];
  const { data, error } = await (supabase as any)
    .from(table)
    .select("*")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return (data || []) as T[];
}

// Postgres "undefined_column" — raised while the prospect-model migration has
// not yet been applied to the environment the app is pointed at.
const UNDEFINED_COLUMN = "42703";

// Clients are fetched by lifecycle so that pre-sale rows never leak into
// surfaces that report spend, KPIs or revenue. `null` fetches every lifecycle
// and is reserved for places that genuinely need the whole book.
//
// The lifecycle column is tolerated as absent so that code and migration can
// deploy in either order: before the migration every row is a paying client,
// which is exactly how the app behaved beforehand, and nothing can be a
// prospect yet.
async function fetchClientsByLifecycle(
  workspaceId: string | null,
  lifecycle: ClientLifecycle | null,
): Promise<DbClient[]> {
  if (!workspaceId) return [];
  const base = () =>
    (supabase as any).from("clients").select("*").eq("workspace_id", workspaceId);

  const q = lifecycle ? base().eq("lifecycle", lifecycle) : base();
  const { data, error } = await q;

  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      if (lifecycle === "prospect" || lifecycle === "churned") return [];
      const { data: all, error: allErr } = await base();
      if (allErr) throw allErr;
      return (all || []) as DbClient[];
    }
    throw error;
  }
  return (data || []) as DbClient[];
}

// Fetch the workspace's GHL sub-account names keyed by location id, so client
// rows can display the GHL name while remaining searchable by their own name.
async function fetchGhlNames(workspaceId: string | null): Promise<Record<string, string>> {
  if (!workspaceId) return {};
  const { data } = await (supabase as any)
    .from("ghl_locations")
    .select("location_id, name, business_name")
    .eq("workspace_id", workspaceId);
  const map: Record<string, string> = {};
  for (const r of data || []) {
    const n = String(r.name || r.business_name || "").trim();
    if (n) map[r.location_id] = n;
  }
  return map;
}

/** Attach ghlName + a display name sourced from the linked GHL sub-account. */
function withGhlName<T extends { ghlLocationId?: string | null; name: string }>(
  c: T,
  ghlNames: Record<string, string>
) {
  const ghlName = c.ghlLocationId ? ghlNames[c.ghlLocationId] ?? null : null;
  return {
    ...c,
    ghlName,
    accountName: c.name,
    name: ghlName || c.name,
  };
}

/**
 * Paying clients only. Every reporting, billing and KPI surface uses this, so
 * prospects stay out of portfolio numbers by default rather than by each caller
 * remembering to filter.
 */
export function useClients() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["clients", wsId, "client"],
    queryFn: async () => {
      const [rows, ghlNames] = await Promise.all([
        fetchClientsByLifecycle(wsId, "client"),
        fetchGhlNames(wsId),
      ]);
      return rows.map((r) => withGhlName(toClient(r), ghlNames));
    },
    enabled: !!wsId,
  });
}

/** Pre-sale rows only — the agency's own pipeline. */
export function useProspects() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["clients", wsId, "prospect"],
    queryFn: async () => {
      const [rows, ghlNames] = await Promise.all([
        fetchClientsByLifecycle(wsId, "prospect"),
        fetchGhlNames(wsId),
      ]);
      return rows.map((r) => withGhlName(toClient(r), ghlNames));
    },
    enabled: !!wsId,
  });
}

/**
 * Every lifecycle. Only for surfaces that must resolve a client by id
 * regardless of sale stage — lookups, admin tooling, impersonation.
 */
export function useAllClients() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["clients", wsId, "all"],
    queryFn: async () => {
      const [rows, ghlNames] = await Promise.all([
        fetchClientsByLifecycle(wsId, null),
        fetchGhlNames(wsId),
      ]);
      return rows.map((r) => withGhlName(toClient(r), ghlNames));
    },
    enabled: !!wsId,
  });
}

export function useClient(id: number) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["clients", wsId, id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients").select("*")
        .eq("id", id).eq("workspace_id", wsId).single();
      if (error) throw error;
      const ghlNames = await fetchGhlNames(wsId);
      return withGhlName(toClient(data as DbClient), ghlNames);
    },
    enabled: !!id && !!wsId,
  });
}


export function useCampaigns() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["campaigns", wsId],
    queryFn: () => fetchScoped<DbCampaign>("campaigns", wsId),
    select: (data) => data.map(toCampaign),
    enabled: !!wsId,
  });
}

export function useReports() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["reports", wsId],
    queryFn: () => fetchScoped<DbReport>("reports", wsId),
    select: (data) => data.map(toReport),
    enabled: !!wsId,
  });
}

export function useActivityLog() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["activity_log", wsId],
    queryFn: () => fetchScoped<DbActivityLog>("activity_log", wsId),
    enabled: !!wsId,
  });
}

export function useOnboarding() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["onboarding", wsId],
    queryFn: () => fetchScoped<DbOnboarding>("onboarding", wsId),
    enabled: !!wsId,
  });
}

export function useLeads() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["leads", wsId],
    queryFn: () => fetchScoped<DbLead>("leads", wsId),
    enabled: !!wsId,
  });
}

// Map workspace roles to display labels in the Team panel
const WS_ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Member",
};

export function useTeamMembers() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["team_members", wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<DbTeamMember[]> => {
      // Source of truth: real workspace members joined with profile info.
      const { data: members, error } = await (supabase as any)
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", wsId);
      if (error) throw error;
      const ids = (members || []).map((m: any) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, display_name, email, phone")
        .in("id", ids);
      const pMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));
      return (members || []).map((m: any) => {
        const p = pMap.get(m.user_id) || {};
        return {
          id: m.user_id,
          name: p.display_name || p.email || "Unknown",
          email: p.email ?? null,
          phone: p.phone ?? null,
          role: WS_ROLE_LABEL[m.role] ?? (m.role || "Member"),
          access_level: "Standard",
          member_status: "active",
        } as DbTeamMember;
      });
    },
  });
}

export interface CreateTeamMemberResult {
  member: DbTeamMember;
  invite_link: string | null;
  created: boolean;
}

export function useCreateTeamMember() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (input: TeamMemberInput): Promise<CreateTeamMemberResult> => {
      if (!currentWorkspace?.id) throw new Error("Select a workspace first");
      if (!input.email) throw new Error("An email is required to create a login");
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workspace-invite-user`;
      const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anon,
            Authorization: `Bearer ${token ?? anon}`,
          },
          body: JSON.stringify({ ...input, workspace_id: currentWorkspace.id }),
        });
      } catch (e: any) {
        throw new Error(e?.message || "Network error reaching invite function");
      }
      let data: any = null;
      try { data = await res.json(); } catch { /* non-JSON */ }
      if (!res.ok) {
        throw new Error(data?.error || `Failed to create user (HTTP ${res.status})`);
      }
      if (data?.error) throw new Error(data.error);
      return {
        member: data.member as DbTeamMember,
        invite_link: data.invite_link ?? null,
        created: !!data.created,
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}

// Updating role on a workspace member; other fields are display-only here.
export function useUpdateTeamMember() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TeamMemberInput> & { id: string }) => {
      const wsId = currentWorkspace?.id;
      if (!wsId) throw new Error("No workspace");
      if (patch.role) {
        const wsRole = (Object.entries(WS_ROLE_LABEL).find(([, v]) => v === patch.role)?.[0]) ?? "member";
        const { error } = await (supabase as any)
          .from("workspace_members")
          .update({ role: wsRole })
          .eq("user_id", id)
          .eq("workspace_id", wsId);
        if (error) throw error;
      }
      return { id } as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}

export function useDeleteTeamMember() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (id: string) => {
      const wsId = currentWorkspace?.id;
      if (!wsId) throw new Error("No workspace");
      const { error } = await (supabase as any)
        .from("workspace_members")
        .delete()
        .eq("user_id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team_members"] }),
  });
}



// Flag (or clear) a client as the workspace's agency account. At most one is
// allowed per workspace, so we clear any existing flag before setting the new
// one (avoids tripping the partial unique index).
export function useSetAgencyAccount() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async ({ clientId, value }: { clientId: number; value: boolean }) => {
      const wsId = currentWorkspace?.id ?? null;
      if (value && wsId) {
        const { error: clearErr } = await (supabase as any)
          .from("clients")
          .update({ is_agency_account: false })
          .eq("workspace_id", wsId)
          .eq("is_agency_account", true)
          .neq("id", clientId);
        if (clearErr) throw clearErr;
      }
      const { error } = await (supabase as any)
        .from("clients")
        .update({ is_agency_account: value })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

// Create a new client pre-flagged as the agency account, seeded from the
// agency profile name when available. Clears any prior agency flag first.
export function useCreateAgencyAccount() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (name: string) => {
      const wsId = currentWorkspace?.id ?? null;
      if (!wsId) throw new Error("No workspace selected");
      const clean = name.trim() || "Agency Account";
      const { error: clearErr } = await (supabase as any)
        .from("clients")
        .update({ is_agency_account: false })
        .eq("workspace_id", wsId)
        .eq("is_agency_account", true);
      if (clearErr) throw clearErr;
      const { data, error } = await (supabase as any)
        .from("clients")
        .insert({ workspace_id: wsId, name: clean, brand: clean, is_agency_account: true })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export interface DbAdAccount {
  id: string;
  workspace_id: string;
  provider: string;
  external_account_id: string;
  account_name: string | null;
  status: string;
  created_at: string;
}

export function useAdAccounts() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["ad_accounts", wsId],
    queryFn: () => fetchScoped<DbAdAccount>("ad_accounts", wsId),
    enabled: !!wsId,
  });
}

/**
 * Returns the set of client ids that have at least one Meta ad account
 * mapped to them in the current workspace. Used to gate the "fully synced"
 * filter on the main dashboard.
 */
export function useClientsWithMetaAccount() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["clients_with_meta_account", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      // A client counts as "Meta-synced" if ANY of:
      //  1. It directly owns a Meta ad account (meta_ad_accounts.client_id)
      //  2. It's a shared member of a Meta ad account (meta_ad_account_clients)
      //  3. It has at least one campaign mapped to it (campaigns.client_id)
      const ownedP = (supabase as any)
        .from("meta_ad_accounts")
        .select("client_id")
        .eq("workspace_id", wsId)
        .not("client_id", "is", null);
      const sharedP = (supabase as any)
        .from("meta_ad_account_clients")
        .select("client_id")
        .eq("workspace_id", wsId);
      const campaignsP = (supabase as any)
        .from("campaigns")
        .select("client_id")
        .eq("workspace_id", wsId)
        .not("client_id", "is", null);
      const [owned, shared, campaigns] = await Promise.all([ownedP, sharedP, campaignsP]);
      if (owned.error) throw owned.error;
      if (shared.error) throw shared.error;
      if (campaigns.error) throw campaigns.error;
      const set = new Set<number>();
      for (const r of owned.data || []) set.add(Number(r.client_id));
      for (const r of shared.data || []) set.add(Number(r.client_id));
      for (const r of campaigns.data || []) set.add(Number(r.client_id));
      return set;
    },
  });
}

