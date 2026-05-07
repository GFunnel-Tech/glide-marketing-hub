import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export type RebillCadence = "monthly" | "weekly" | "custom";
export type AssignmentLevel = "account" | "campaign" | "adset" | "ad";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export interface RebillConfig {
  id: string;
  workspace_id: string;
  client_id: number;
  enabled: boolean;
  markup_pct: number;
  fixed_fee: number;
  monthly_minimum: number;
  cadence: RebillCadence;
  currency: string;
  notes: string | null;
}

export interface RebillAssignment {
  id: string;
  workspace_id: string;
  client_id: number;
  ad_account_id: string;
  level: AssignmentLevel;
  object_id: string;
  object_name: string | null;
  excluded: boolean;
}

export interface RebillInvoice {
  id: string;
  workspace_id: string;
  client_id: number;
  period_start: string;
  period_end: string;
  raw_spend: number;
  markup_pct: number;
  fixed_fee: number;
  monthly_minimum: number;
  total_due: number;
  currency: string;
  status: InvoiceStatus;
  invoice_number: string | null;
  pdf_url: string | null;
  stripe_invoice_id: string | null;
  paid_at: string | null;
  sent_at: string | null;
  line_items: any;
  notes: string | null;
  created_at: string;
}

export function useRebillConfigs() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["rebill_configs", currentWorkspace?.id],
    enabled: !!currentWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rebill_configs" as any)
        .select("*")
        .eq("workspace_id", currentWorkspace!.id);
      if (error) throw error;
      return (data as any[]) as RebillConfig[];
    },
  });
}

export function useRebillAssignments(clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["rebill_assignments", currentWorkspace?.id, clientId],
    enabled: !!currentWorkspace,
    queryFn: async () => {
      let q = supabase
        .from("rebill_assignments" as any)
        .select("*")
        .eq("workspace_id", currentWorkspace!.id);
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) as RebillAssignment[];
    },
  });
}

export function useRebillInvoices(clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["rebill_invoices", currentWorkspace?.id, clientId],
    enabled: !!currentWorkspace,
    queryFn: async () => {
      let q = supabase
        .from("rebill_invoices" as any)
        .select("*")
        .eq("workspace_id", currentWorkspace!.id)
        .order("period_start", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) as RebillInvoice[];
    },
  });
}

export function useUpsertRebillConfig() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (cfg: Partial<RebillConfig> & { client_id: number }) => {
      const payload = { ...cfg, workspace_id: currentWorkspace!.id };
      const { error } = await supabase
        .from("rebill_configs" as any)
        .upsert(payload, { onConflict: "workspace_id,client_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rebill_configs"] });
      toast.success("Rebill config saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAddAssignment() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (a: Omit<RebillAssignment, "id" | "workspace_id">) => {
      const { error } = await supabase
        .from("rebill_assignments" as any)
        .insert({ ...a, workspace_id: currentWorkspace!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rebill_assignments"] });
      toast.success("Assignment added");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rebill_assignments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rebill_assignments"] }),
  });
}

export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { clientId: number; periodStart: string; periodEnd: string }) => {
      const { data, error } = await supabase.functions.invoke("rebill-generate-invoice", {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rebill_invoices"] });
      toast.success("Invoice generated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to generate invoice"),
  });
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InvoiceStatus }) => {
      const patch: any = { status };
      if (status === "paid") patch.paid_at = new Date().toISOString();
      if (status === "sent") patch.sent_at = new Date().toISOString();
      const { error } = await supabase.from("rebill_invoices" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rebill_invoices"] });
      toast.success("Invoice updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
