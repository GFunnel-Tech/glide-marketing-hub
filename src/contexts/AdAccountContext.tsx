import { createContext, useContext, useState, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export type AdAccountOption = {
  id: string;          // act_id
  name: string;
  currency?: string | null;
};

type Ctx = {
  /** "all" or a Meta act_id */
  selected: string;
  setSelected: (v: string) => void;
  accounts: AdAccountOption[];
  isLoading: boolean;
};

const AdAccountContext = createContext<Ctx | null>(null);

export function AdAccountProvider({ children }: { children: ReactNode }) {
  const { currentWorkspace } = useWorkspace();
  const [selected, setSelected] = useState<string>("all");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["meta-ad-accounts", currentWorkspace?.id],
    enabled: !!currentWorkspace?.id,
    queryFn: async (): Promise<AdAccountOption[]> => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("meta_ad_accounts")
        .select("act_id, account_name, currency, is_active")
        .eq("workspace_id", currentWorkspace.id)
        .eq("is_active", true)
        .order("account_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((a: any) => ({
        id: a.act_id,
        name: a.account_name || a.act_id,
        currency: a.currency,
      }));
    },
  });

  const value = useMemo(() => ({ selected, setSelected, accounts, isLoading }), [selected, accounts, isLoading]);

  return <AdAccountContext.Provider value={value}>{children}</AdAccountContext.Provider>;
}

export function useAdAccount() {
  const ctx = useContext(AdAccountContext);
  if (!ctx) throw new Error("useAdAccount must be used within AdAccountProvider");
  return ctx;
}
