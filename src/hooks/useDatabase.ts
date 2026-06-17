import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface DbClient {
  id: number;
  name: string;
  brand: string;
  status: "GREEN" | "YELLOW" | "RED" | "BLOCKED" | "NEW" | "PENDING_APPROVAL" | "SETUP_COMPLETE" | "LAUNCHING" | "LEARNING" | "RELAUNCH" | "PAUSED" | "PENDING_CANCELLATION" | "CANCELLED";
  bm_type: "Own BM" | "Agency BM";
  cpl: number;
  cpm: number;
  leads: number;
  spend: number;
  form_cvr: number;
  frequency: number;
  plai_connected: boolean;
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
    status: c.status,
    bmType: c.bm_type,
    cpl: Number(c.cpl),
    cpm: Number(c.cpm),
    leads: c.leads,
    spend: Number(c.spend),
    formCvr: Number(c.form_cvr),
    frequency: Number(c.frequency),
    plaiConnected: c.plai_connected,
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
  };
}

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

export function useClients() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["clients", wsId],
    queryFn: () => fetchScoped<DbClient>("clients", wsId),
    select: (data) => data.map(toClient),
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
      return toClient(data as DbClient);
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
      const { data, error } = await (supabase as any)
        .from("meta_ad_accounts")
        .select("client_id")
        .eq("workspace_id", wsId)
        .not("client_id", "is", null);
      if (error) throw error;
      return new Set<number>((data || []).map((r: any) => Number(r.client_id)));
    },
  });
}

