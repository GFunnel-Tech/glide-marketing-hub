import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface DbClient {
  id: number;
  name: string;
  brand: string;
  status: "GREEN" | "YELLOW" | "RED" | "BLOCKED";
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
  role: string;
  access_level: string;
  member_status: string;
}

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

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team_members"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("team_members").select("*");
      if (error) throw error;
      return (data || []) as DbTeamMember[];
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
