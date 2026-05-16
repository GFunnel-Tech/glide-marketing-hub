import { useEffect } from "react";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "../shared/Section";
import { User } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";

export function IdentitySection() {
  const { currentWorkspace } = useWorkspace();
  const state = useAdDraftStore((s) => s.state);
  const patchMany = useAdDraftStore((s) => s.patchMany);

  const { data } = useQuery({
    queryKey: ["meta_identities", currentWorkspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-list-identities", {
        body: { workspaceId: currentWorkspace!.id },
      });
      if (error) throw error;
      return data as { pages: { id: string; name: string; avatar?: string }[]; adAccounts: { act_id: string; account_name: string; currency: string }[] };
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-select first page & ad account once loaded
  useEffect(() => {
    if (!data) return;
    const patch: any = {};
    if (!state.pageId && data.pages?.[0]) {
      patch.pageId = data.pages[0].id;
      patch.pageName = data.pages[0].name;
      patch.pageAvatar = data.pages[0].avatar ?? null;
    }
    if (!state.adAccountId && data.adAccounts?.[0]) {
      patch.adAccountId = data.adAccounts[0].act_id;
      if (data.adAccounts[0].currency) patch.currency = data.adAccounts[0].currency;
    }
    if (Object.keys(patch).length) patchMany(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <Section title="Identity" icon={<User className="h-4 w-4 text-primary" />}>
      <div>
        <label className="text-xs font-medium text-foreground">Facebook Page</label>
        <Select
          value={state.pageId ?? ""}
          onValueChange={(v) => {
            const p = data?.pages.find((pg) => pg.id === v);
            patchMany({ pageId: v, pageName: p?.name ?? null, pageAvatar: p?.avatar ?? null });
          }}
        >
          <SelectTrigger className="h-9 mt-1.5"><SelectValue placeholder="Select a Page" /></SelectTrigger>
          <SelectContent>
            {(data?.pages ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground">Ad Account</label>
        <Select
          value={state.adAccountId ?? ""}
          onValueChange={(v) => {
            const a = data?.adAccounts.find((acc) => acc.act_id === v);
            patchMany({ adAccountId: v, currency: a?.currency ?? "USD" });
          }}
        >
          <SelectTrigger className="h-9 mt-1.5"><SelectValue placeholder="Select Ad Account" /></SelectTrigger>
          <SelectContent>
            {(data?.adAccounts ?? []).map((a) => <SelectItem key={a.act_id} value={a.act_id}>{a.account_name || a.act_id}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </Section>
  );
}
