import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ---------------------------------------------------------------------------
// Types (mirror supabase/migrations/20260703120000_affiliate_module.sql)
// ---------------------------------------------------------------------------
export type PartnerStatus = "active" | "paused" | "archived";
export type CommissionType = "percent" | "flat";
export type ReferralStatus = "lead" | "trial" | "converted" | "lost";
export type CommissionStatus = "pending" | "approved" | "paid" | "void";
export type PayoutStatus = "requested" | "processing" | "paid" | "failed";
export type IntegrationProvider = "partnero" | "rewardful" | "firstpromoter" | "custom";

export interface AffiliatePartner {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  company: string | null;
  status: PartnerStatus;
  commission_type: CommissionType;
  commission_rate: number;
  flat_amount: number;
  referral_code: string;
  payout_method: string | null;
  payout_details: string | null;
  notes: string | null;
  external_provider: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateReferral {
  id: string;
  workspace_id: string;
  partner_id: string;
  client_id: number | null;
  contact_name: string;
  contact_email: string | null;
  source: string | null;
  status: ReferralStatus;
  deal_value: number | null;
  currency: string;
  converted_at: string | null;
  external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AffiliateCommission {
  id: string;
  workspace_id: string;
  partner_id: string;
  referral_id: string | null;
  description: string | null;
  basis_amount: number | null;
  amount: number;
  currency: string;
  occurred_on: string;
  status: CommissionStatus;
  paid_at: string | null;
  payout_id: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliatePayout {
  id: string;
  workspace_id: string;
  partner_id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  method: string | null;
  reference: string | null;
  notes: string | null;
  requested_by: string | null;
  requested_at: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateApiKey {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  enabled: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface AffiliateIntegration {
  id: string;
  workspace_id: string;
  provider: IntegrationProvider;
  api_key: string | null;
  api_base: string | null;
  program_id: string | null;
  webhook_token: string;
  webhook_secret: string | null;
  settings: Record<string, unknown>;
  enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateEvent {
  id: string;
  workspace_id: string;
  source: "api" | "webhook" | "sync" | "app";
  provider: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  status: string;
  error: string | null;
  created_at: string;
}

export type PartnerInput = Pick<
  AffiliatePartner,
  "name" | "email" | "company" | "status" | "commission_type" | "commission_rate"
  | "flat_amount" | "payout_method" | "payout_details" | "notes"
> & { referral_code?: string };

export type ReferralInput = Pick<
  AffiliateReferral,
  "partner_id" | "contact_name" | "contact_email" | "source" | "status" | "deal_value" | "currency"
> & { client_id?: number | null };

export type CommissionInput = Pick<
  AffiliateCommission,
  "partner_id" | "description" | "basis_amount" | "amount" | "currency" | "occurred_on" | "status"
> & { referral_id?: string | null };

export function commissionForPartner(partner: AffiliatePartner, basis: number): number {
  if (partner.commission_type === "flat") return Number(partner.flat_amount) || 0;
  return Math.round(basis * (Number(partner.commission_rate) / 100) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Generic workspace-scoped table hook
// ---------------------------------------------------------------------------
function useWorkspaceTable<T>(table: string, orderBy = "created_at") {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const queryKey = [table, wsId];

  const query = useQuery({
    queryKey,
    enabled: !!wsId,
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await (supabase as any)
        .from(table)
        .select("*")
        .eq("workspace_id", wsId)
        .order(orderBy, { ascending: false });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });

  return { ...query, wsId, queryKey };
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------
export function usePartners() {
  const base = useWorkspaceTable<AffiliatePartner>("affiliate_partners");
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: base.queryKey });

  const save = useMutation({
    mutationFn: async (vars: { id?: string } & PartnerInput) => {
      if (!base.wsId) throw new Error("No workspace selected");
      const { id, ...fields } = vars;
      if (id) {
        const { error } = await (supabase as any).from("affiliate_partners").update(fields).eq("id", id);
        if (error) throw error;
      } else {
        const insert: Record<string, unknown> = { ...fields, workspace_id: base.wsId };
        if (!insert.referral_code) delete insert.referral_code; // let the DB default generate one
        const { error } = await (supabase as any).from("affiliate_partners").insert(insert);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("affiliate_partners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...base, partners: base.data ?? [], save, remove };
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------
export function useReferrals() {
  const base = useWorkspaceTable<AffiliateReferral>("affiliate_referrals");
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: base.queryKey });

  const save = useMutation({
    mutationFn: async (vars: { id?: string } & ReferralInput) => {
      if (!base.wsId) throw new Error("No workspace selected");
      const { id, ...fields } = vars;
      const patch: Record<string, unknown> = { ...fields };
      if (fields.status === "converted") patch.converted_at = new Date().toISOString();
      if (id) {
        const { error } = await (supabase as any).from("affiliate_referrals").update(patch).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("affiliate_referrals")
          .insert({ ...patch, workspace_id: base.wsId });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("affiliate_referrals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...base, referrals: base.data ?? [], save, remove };
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------
export function useCommissions() {
  const base = useWorkspaceTable<AffiliateCommission>("affiliate_commissions", "occurred_on");
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: base.queryKey });
    qc.invalidateQueries({ queryKey: ["affiliate_payouts", base.wsId] });
  };

  const save = useMutation({
    mutationFn: async (vars: { id?: string } & CommissionInput) => {
      if (!base.wsId) throw new Error("No workspace selected");
      const { id, ...fields } = vars;
      if (id) {
        const { error } = await (supabase as any).from("affiliate_commissions").update(fields).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("affiliate_commissions")
          .insert({ ...fields, workspace_id: base.wsId });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: async (vars: { id: string; status: CommissionStatus }) => {
      const patch: Record<string, unknown> = { status: vars.status };
      if (vars.status === "paid") patch.paid_at = new Date().toISOString();
      const { error } = await (supabase as any).from("affiliate_commissions").update(patch).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("affiliate_commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...base, commissions: base.data ?? [], save, setStatus, remove };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------
export function usePayouts() {
  const base = useWorkspaceTable<AffiliatePayout>("affiliate_payouts");
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: base.queryKey });
    qc.invalidateQueries({ queryKey: ["affiliate_commissions", base.wsId] });
  };

  // Sweep a set of approved commissions into one payout batch for a partner.
  const create = useMutation({
    mutationFn: async (vars: {
      partner_id: string;
      commission_ids: string[];
      amount: number;
      currency: string;
      method?: string | null;
      notes?: string | null;
    }) => {
      if (!base.wsId) throw new Error("No workspace selected");
      const { data: payout, error } = await (supabase as any)
        .from("affiliate_payouts")
        .insert({
          workspace_id: base.wsId,
          partner_id: vars.partner_id,
          amount: vars.amount,
          currency: vars.currency,
          method: vars.method ?? null,
          notes: vars.notes ?? null,
          requested_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (vars.commission_ids.length) {
        const { error: linkErr } = await (supabase as any)
          .from("affiliate_commissions")
          .update({ payout_id: payout.id })
          .in("id", vars.commission_ids);
        if (linkErr) throw linkErr;
      }
      return payout.id as string;
    },
    onSuccess: invalidate,
  });

  // Advancing a payout to "paid" also marks its swept commissions paid.
  const setStatus = useMutation({
    mutationFn: async (vars: { id: string; status: PayoutStatus }) => {
      const patch: Record<string, unknown> = { status: vars.status };
      if (vars.status === "paid") patch.paid_at = new Date().toISOString();
      const { error } = await (supabase as any).from("affiliate_payouts").update(patch).eq("id", vars.id);
      if (error) throw error;
      if (vars.status === "paid") {
        const { error: commErr } = await (supabase as any)
          .from("affiliate_commissions")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("payout_id", vars.id);
        if (commErr) throw commErr;
      }
    },
    onSuccess: invalidate,
  });

  return { ...base, payouts: base.data ?? [], create, setStatus };
}

// ---------------------------------------------------------------------------
// API keys — created via the affiliate-sync edge function so the plaintext
// key is generated server-side and shown exactly once.
// ---------------------------------------------------------------------------
export function useAffiliateApiKeys() {
  const base = useWorkspaceTable<AffiliateApiKey>("affiliate_api_keys");
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: base.queryKey });

  const create = useMutation({
    mutationFn: async (vars: { name: string; scopes?: string[] }): Promise<AffiliateApiKey & { key: string }> => {
      if (!base.wsId) throw new Error("No workspace selected");
      const { data, error } = await supabase.functions.invoke("affiliate-sync", {
        body: { action: "create_api_key", workspace_id: base.wsId, name: vars.name, scopes: vars.scopes },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("affiliate_api_keys")
        .update({ enabled: false, revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("affiliate_api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...base, apiKeys: base.data ?? [], create, revoke, remove };
}

// ---------------------------------------------------------------------------
// Integrations (Partnero & co)
// ---------------------------------------------------------------------------
export interface IntegrationInput {
  provider: IntegrationProvider;
  api_key?: string | null;
  api_base?: string | null;
  program_id?: string | null;
  webhook_secret?: string | null;
  enabled?: boolean;
}

export function useAffiliateIntegrations() {
  const base = useWorkspaceTable<AffiliateIntegration>("affiliate_integrations");
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: base.queryKey });

  const save = useMutation({
    mutationFn: async (vars: { id?: string } & IntegrationInput) => {
      if (!base.wsId) throw new Error("No workspace selected");
      const { id, ...fields } = vars;
      if (id) {
        const { error } = await (supabase as any).from("affiliate_integrations").update(fields).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("affiliate_integrations")
          .insert({ ...fields, workspace_id: base.wsId });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("affiliate_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const test = useMutation({
    mutationFn: async (provider: IntegrationProvider): Promise<{ ok: boolean; message: string }> => {
      if (!base.wsId) throw new Error("No workspace selected");
      const { data, error } = await supabase.functions.invoke("affiliate-sync", {
        body: { action: "test", workspace_id: base.wsId, provider },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: invalidate,
  });

  const sync = useMutation({
    mutationFn: async (
      provider: IntegrationProvider,
    ): Promise<{ ok: boolean; partners?: number; commissions?: number; message?: string }> => {
      if (!base.wsId) throw new Error("No workspace selected");
      const { data, error } = await supabase.functions.invoke("affiliate-sync", {
        body: { action: "sync", workspace_id: base.wsId, provider },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["affiliate_partners", base.wsId] });
      qc.invalidateQueries({ queryKey: ["affiliate_commissions", base.wsId] });
      qc.invalidateQueries({ queryKey: ["affiliate_events", base.wsId] });
    },
  });

  return { ...base, integrations: base.data ?? [], save, remove, test, sync };
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------
export function useAffiliateEvents(limit = 50) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["affiliate_events", wsId, limit],
    enabled: !!wsId,
    queryFn: async (): Promise<AffiliateEvent[]> => {
      const { data, error } = await (supabase as any)
        .from("affiliate_events")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AffiliateEvent[];
    },
  });
}

// ---------------------------------------------------------------------------
// Aggregate summary for the overview tab
// ---------------------------------------------------------------------------
export function useAffiliateSummary() {
  const { partners } = usePartners();
  const { referrals } = useReferrals();
  const { commissions } = useCommissions();
  const { payouts } = usePayouts();

  return useMemo(() => {
    const sum = (rows: AffiliateCommission[]) => rows.reduce((s, c) => s + Number(c.amount), 0);
    const pending = commissions.filter((c) => c.status === "pending");
    const approved = commissions.filter((c) => c.status === "approved");
    const paid = commissions.filter((c) => c.status === "paid");
    const converted = referrals.filter((r) => r.status === "converted");
    return {
      activePartners: partners.filter((p) => p.status === "active").length,
      totalPartners: partners.length,
      totalReferrals: referrals.length,
      convertedReferrals: converted.length,
      conversionRate: referrals.length ? Math.round((converted.length / referrals.length) * 100) : 0,
      pendingAmount: sum(pending),
      approvedAmount: sum(approved),
      paidAmount: sum(paid),
      openPayouts: payouts.filter((p) => p.status === "requested" || p.status === "processing").length,
    };
  }, [partners, referrals, commissions, payouts]);
}
