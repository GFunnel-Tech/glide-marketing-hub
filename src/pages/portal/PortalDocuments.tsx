import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PortalDocuments() {
  const { clientId } = usePortalClient();

  const reports = useQuery({
    queryKey: ["portal-docs-reports", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_reports")
        .select("id,period_start,period_end,pdf_url,status,generated_at")
        .eq("client_id", clientId!)
        .order("period_end", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">Reports, agreements, briefs, and invoices for your account.</p>
      </div>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="agreements">Agreements</TabsTrigger>
          <TabsTrigger value="sops">SOPs</TabsTrigger>
          <TabsTrigger value="briefs">Creative briefs</TabsTrigger>
        </TabsList>

        <TabsContent value="reports">
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {(reports.data ?? []).map((r: any) => (
                <li key={r.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium">{r.period_start} → {r.period_end}</p>
                    <p className="text-xs text-muted-foreground">{r.status} · {r.generated_at ? new Date(r.generated_at).toLocaleDateString() : "—"}</p>
                  </div>
                  {r.pdf_url ? (
                    <a className="text-sm text-[hsl(var(--accent))] hover:underline" href={r.pdf_url} target="_blank" rel="noreferrer">
                      Download PDF
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not ready</span>
                  )}
                </li>
              ))}
              {!reports.data?.length && (
                <li className="p-6 text-center text-sm text-muted-foreground">No reports yet.</li>
              )}
            </ul>
          </Card>
        </TabsContent>

        <TabsContent value="agreements">
          <Card className="p-6 text-sm text-muted-foreground">Your signed agreements will appear here.</Card>
        </TabsContent>
        <TabsContent value="sops">
          <Card className="p-6 text-sm text-muted-foreground">Onboarding and process docs your team shares with you.</Card>
        </TabsContent>
        <TabsContent value="briefs">
          <Card className="p-6 text-sm text-muted-foreground">All creative briefs submitted for your account.</Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
