import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

// Adapters to map DB shape → legacy mock shape for minimal component changes
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

// Queries
async function fetchTable<T>(table: string): Promise<T[]> {
  const { data, error } = await (supabase as any).from(table).select("*");
  if (error) throw error;
  return (data || []) as T[];
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchTable<DbClient>("clients"),
    select: (data) => data.map(toClient),
  });
}

export function useClient(id: number) {
  return useQuery({
    queryKey: ["clients", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return toClient(data as DbClient);
    },
    enabled: !!id,
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fetchTable<DbCampaign>("campaigns"),
    select: (data) => data.map(toCampaign),
  });
}

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: () => fetchTable<DbReport>("reports"),
    select: (data) => data.map(toReport),
  });
}

export function useActivityLog() {
  return useQuery({
    queryKey: ["activity_log"],
    queryFn: () => fetchTable<DbActivityLog>("activity_log"),
  });
}

export function useOnboarding() {
  return useQuery({
    queryKey: ["onboarding"],
    queryFn: () => fetchTable<DbOnboarding>("onboarding"),
  });
}

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: () => fetchTable<DbLead>("leads"),
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team_members"],
    queryFn: () => fetchTable<DbTeamMember>("team_members"),
  });
}
