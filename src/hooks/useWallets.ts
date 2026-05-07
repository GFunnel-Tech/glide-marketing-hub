import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export type WalletTxnType =
  | "topup" | "invoice_charge" | "manual_credit" | "manual_debit" | "refund" | "adjustment";

export interface ClientWallet {
  id: string;
  workspace_id: string;
  client_id: number;
  balance: number;
  currency: string;
  auto_topup_enabled: boolean;
  low_balance_threshold: number;
  topup_amount: number;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  last_transaction_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  workspace_id: string;
  client_id: number;
  type: WalletTxnType;
  amount: number;
  balance_after: number;
  description: string | null;
  invoice_id: string | null;
  created_at: string;
}

export function useWallets() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["client_wallets", currentWorkspace?.id],
    enabled: !!currentWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wallets" as any).select("*")
        .eq("workspace_id", currentWorkspace!.id);
      if (error) throw error;
      return (data as any[]) as ClientWallet[];
    },
  });
}

export function useWallet(clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["client_wallet", currentWorkspace?.id, clientId],
    enabled: !!currentWorkspace && !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_wallets" as any).select("*")
        .eq("workspace_id", currentWorkspace!.id)
        .eq("client_id", clientId!).maybeSingle();
      if (error) throw error;
      return (data as any) as ClientWallet | null;
    },
  });
}

export function useWalletTransactions(walletId?: string) {
  return useQuery({
    queryKey: ["wallet_transactions", walletId],
    enabled: !!walletId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions" as any).select("*")
        .eq("wallet_id", walletId!)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data as any[]) as WalletTransaction[];
    },
  });
}

export function useUpsertWallet() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (w: Partial<ClientWallet> & { client_id: number }) => {
      const payload = { ...w, workspace_id: currentWorkspace!.id, currency: "USD" };
      const { error } = await supabase
        .from("client_wallets" as any)
        .upsert(payload, { onConflict: "client_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_wallets"] });
      qc.invalidateQueries({ queryKey: ["client_wallet"] });
      toast.success("Wallet saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAddWalletTransaction() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (params: {
      wallet_id: string; client_id: number; type: WalletTxnType;
      amount: number; description?: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("wallet_transactions" as any).insert({
        wallet_id: params.wallet_id,
        workspace_id: currentWorkspace!.id,
        client_id: params.client_id,
        type: params.type,
        amount: params.amount,
        balance_after: 0, // overwritten by trigger
        description: params.description ?? null,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["wallet_transactions", vars.wallet_id] });
      qc.invalidateQueries({ queryKey: ["client_wallet"] });
      qc.invalidateQueries({ queryKey: ["client_wallets"] });
      toast.success("Transaction recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
