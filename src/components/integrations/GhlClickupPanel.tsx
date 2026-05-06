import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

export function GhlClickupPanel() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [ghlKey, setGhlKey] = useState("");
  const [clickupToken, setClickupToken] = useState("");
  const [clickupListId, setClickupListId] = useState("");

  useEffect(() => {
    if (!wsId) return;
    setLoading(true);
    (supabase as any)
      .from("integration_configs")
      .select("ghl_api_key, clickup_api_token, clickup_default_list_id")
      .eq("workspace_id", wsId)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setGhlKey(data.ghl_api_key ?? "");
          setClickupToken(data.clickup_api_token ?? "");
          setClickupListId(data.clickup_default_list_id ?? "");
        }
        setLoading(false);
      });
  }, [wsId]);

  const save = async () => {
    if (!wsId) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("integration_configs")
      .upsert({
        workspace_id: wsId,
        ghl_api_key: ghlKey || null,
        clickup_api_token: clickupToken || null,
        clickup_default_list_id: clickupListId || null,
      }, { onConflict: "workspace_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Integration settings saved");
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("ghl-lead-check", {
      body: { workspaceId: wsId },
    });
    setRunning(false);
    if (error) toast.error(error.message);
    else toast.success(`Checked ${data?.checked ?? 0} leads — ${data?.flagged ?? 0} flagged`);
  };

  if (!wsId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">GHL → ClickUp lead alerts</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Every hour we check Meta leads aged 4+ hours. Any that didn't appear in GoHighLevel get a ClickUp task.
        </p>
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div>
            <label className="text-xs text-muted-foreground">GoHighLevel API Key</label>
            <Input
              type="password"
              value={ghlKey}
              onChange={(e) => setGhlKey(e.target.value)}
              placeholder="Bearer token from GHL Agency settings"
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Per-client locationId can be set on each Client Profile.
            </p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">ClickUp API Token</label>
            <Input
              type="password"
              value={clickupToken}
              onChange={(e) => setClickupToken(e.target.value)}
              placeholder="pk_..."
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">ClickUp Default List ID</label>
            <Input
              value={clickupListId}
              onChange={(e) => setClickupListId(e.target.value)}
              placeholder="901234567890"
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Per-client list ID overrides this on the Client Profile.
            </p>
          </div>

          {(!ghlKey || !clickupToken || !clickupListId) && (
            <div className="flex items-start gap-2 rounded-md bg-warning/10 border border-warning/30 p-2.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Add GHL key, ClickUp token, and a default list ID to enable automatic alerts.</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} size="sm">
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />} Save
            </Button>
            <Button onClick={runNow} disabled={running || !ghlKey} variant="outline" size="sm">
              {running && <Loader2 className="h-3 w-3 animate-spin mr-1" />} Run check now
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
