import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { TrendingUp, Loader2 } from "lucide-react";

interface Props { clientId: number }

export function ClientTrendBriefSettings({ clientId }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [recipients, setRecipients] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("brief_enabled, brief_recipients, brief_seasonal_context")
        .eq("id", clientId)
        .maybeSingle();
      if (data) {
        setEnabled(data.brief_enabled ?? true);
        setRecipients((data.brief_recipients ?? []).join(", "));
        setContext(data.brief_seasonal_context ?? "");
      }
      setLoading(false);
    })();
  }, [clientId]);

  async function save() {
    setSaving(true);
    const list = recipients.split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
    const { error } = await supabase
      .from("clients")
      .update({ brief_enabled: enabled, brief_recipients: list, brief_seasonal_context: context || null })
      .eq("id", clientId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Trend brief settings saved");
  }

  async function generateNow() {
    setGenerating(true);
    const { data: client } = await supabase.from("clients").select("workspace_id").eq("id", clientId).maybeSingle();
    if (!client?.workspace_id) { setGenerating(false); return; }
    const { data, error } = await supabase.functions.invoke("client-trend-briefs-cron", {
      body: { workspaceId: client.workspace_id, clientId, force: true },
    });
    setGenerating(false);
    if (error) return toast.error(error.message);
    const count = (data?.results ?? []).reduce((a: number, r: any) => a + (r.drafts?.length ?? 0), 0);
    toast.success(count ? `Draft brief created — review in Trend Briefs` : "No trends detected for this client right now");
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          Trend Briefs
        </CardTitle>
        <CardDescription>AI-drafted client email when CPM, CPL or lead trends shift. All drafts require approval before sending.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="brief-enabled" className="font-normal">Auto-detect trend briefs for this client</Label>
          <Switch id="brief-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brief-recipients">Recipients (comma separated)</Label>
          <Input id="brief-recipients" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="owner@business.com, ops@business.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brief-context">Extra context for the AI <span className="text-xs text-muted-foreground">(optional)</span></Label>
          <Textarea id="brief-context" rows={2} value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. Client runs seasonal HVAC promotions in summer; expects higher CPMs in June-August." />
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Save</Button>
          <Button size="sm" variant="outline" onClick={generateNow} disabled={generating}>
            {generating && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Generate draft now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
