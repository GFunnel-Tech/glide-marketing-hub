import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { Card } from "@/components/ui/card";

export default function PortalLeads() {
  const { clientId } = usePortalClient();

  const leads = useQuery({
    queryKey: ["portal-leads", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_leads")
        .select("id,full_name,email,phone,created_time,stage,campaign_name,form_name,sync_status")
        .eq("client_id", clientId!)
        .order("created_time", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const rows = leads.data ?? [];
  const counts = {
    total: rows.length,
    new: rows.filter((r) => r.stage === "intake").length,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-sm text-muted-foreground mt-1">Every lead that's come in, with current pipeline status.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: "Total leads", v: counts.total },
          { l: "New", v: counts.new },
          { l: "Contacted", v: "—" },
          { l: "Booked", v: "—" },
          { l: "Good leads", v: "—" },
        ].map((m) => (
          <Card key={m.l} className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{m.l}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{m.v}</p>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2">Campaign</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Sync</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l: any) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{l.full_name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">
                    <div>{l.email ?? ""}</div>
                    <div className="text-muted-foreground">{l.phone ?? ""}</div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground tabular-nums">
                    {l.created_time ? new Date(l.created_time).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{l.campaign_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{l.stage}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{l.sync_status}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No leads yet — your campaigns will start delivering soon.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
