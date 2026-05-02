import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface MetaLead {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  client_id: number | null;
  lead_id: string;
  form_name: string | null;
  campaign_name: string | null;
  ad_name: string | null;
  created_time: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  field_data: { name: string; values: string[] }[];
}

export function useMetaLeads(clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["meta_leads", wsId, clientId ?? "all"],
    queryFn: async () => {
      if (!wsId) return [];
      let q = (supabase as any)
        .from("meta_leads")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_time", { ascending: false })
        .limit(1000);
      if (clientId !== undefined) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MetaLead[];
    },
    enabled: !!wsId,
  });
}
