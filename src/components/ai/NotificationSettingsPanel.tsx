import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Bell, X, Plus, MessageSquare, Mail } from "lucide-react";
import { toast } from "sonner";

interface NotifSettings {
  email_enabled: boolean;
  slack_enabled: boolean;
  notify_workspace_members: boolean;
  extra_email_recipients: string[];
  slack_channel_id: string;
  slack_channel_name: string;
  alert_on: "queued" | "executed" | "both";
}

const defaults: NotifSettings = {
  email_enabled: true,
  slack_enabled: false,
  notify_workspace_members: true,
  extra_email_recipients: [],
  slack_channel_id: "",
  slack_channel_name: "",
  alert_on: "queued",
};

export function NotificationSettingsPanel({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["ai-notification-settings", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_notification_settings" as any)
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState<NotifSettings>(defaults);
  const [emailInput, setEmailInput] = useState("");

  useEffect(() => {
    if (existing) {
      setForm({
        email_enabled: !!existing.email_enabled,
        slack_enabled: !!existing.slack_enabled,
        notify_workspace_members: !!existing.notify_workspace_members,
        extra_email_recipients: existing.extra_email_recipients ?? [],
        slack_channel_id: existing.slack_channel_id ?? "",
        slack_channel_name: existing.slack_channel_name ?? "",
        alert_on: (existing.alert_on as any) ?? "queued",
      });
    }
  }, [existing, workspaceId]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_notification_settings" as any)
        .upsert(
          { workspace_id: workspaceId, ...form },
          { onConflict: "workspace_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notification settings saved");
      qc.invalidateQueries({ queryKey: ["ai-notification-settings", workspaceId] });
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("ai-notify", {
        body: {
          event: "queued",
          action_id: "test-" + Date.now(),
          workspace_id: workspaceId,
          action_type: "pause_ads",
          reasoning: "Test notification from the AI Assistant settings panel.",
          payload: { ad_ids: ["TEST_AD"], reason: "Test" },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Test sent — check your inbox / Slack"),
    onError: (e: any) => toast.error(e.message || "Test failed"),
  });

  const addEmail = () => {
    const v = emailInput.trim();
    if (!v || !/.+@.+\..+/.test(v)) {
      toast.error("Enter a valid email");
      return;
    }
    if (form.extra_email_recipients.includes(v)) return;
    setForm((f) => ({ ...f, extra_email_recipients: [...f.extra_email_recipients, v] }));
    setEmailInput("");
  };

  const removeEmail = (e: string) =>
    setForm((f) => ({
      ...f,
      extra_email_recipients: f.extra_email_recipients.filter((x) => x !== e),
    }));

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5" />
          AI Agent Notifications
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Get pinged when the agent queues or executes changes.
        </p>
      </div>

      {/* Trigger scope */}
      <div>
        <label className="text-[11px] font-medium text-foreground block mb-1">Alert on</label>
        <div className="flex gap-1">
          {(["queued", "executed", "both"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setForm((f) => ({ ...f, alert_on: v }))}
              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] capitalize ${
                form.alert_on === v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-accent"
              }`}
            >
              {v === "both" ? "Both" : v}
            </button>
          ))}
        </div>
      </div>

      {/* Email */}
      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Email
          </p>
          <Switch
            checked={form.email_enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, email_enabled: v }))}
          />
        </div>
        <div className={`space-y-2 ${form.email_enabled ? "" : "opacity-50 pointer-events-none"}`}>
          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={form.notify_workspace_members}
              onChange={(e) => setForm((f) => ({ ...f, notify_workspace_members: e.target.checked }))}
              className="rounded"
            />
            Send to all workspace members
          </label>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Extra recipients
            </label>
            <div className="flex gap-1 mt-1">
              <input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
                placeholder="person@company.com"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button
                onClick={addEmail}
                className="rounded-md border border-border bg-background px-2 hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {form.extra_email_recipients.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.extra_email_recipients.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px]"
                  >
                    {e}
                    <button onClick={() => removeEmail(e)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slack */}
      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Slack
          </p>
          <Switch
            checked={form.slack_enabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, slack_enabled: v }))}
          />
        </div>
        <div className={`space-y-2 ${form.slack_enabled ? "" : "opacity-50 pointer-events-none"}`}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Channel name
              </label>
              <input
                value={form.slack_channel_name}
                onChange={(e) => setForm((f) => ({ ...f, slack_channel_name: e.target.value }))}
                placeholder="#ai-agent"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Channel ID
              </label>
              <input
                value={form.slack_channel_id}
                onChange={(e) => setForm((f) => ({ ...f, slack_channel_id: e.target.value }))}
                placeholder="C0123456789"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs mt-1"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Get the channel ID from Slack: open channel → name → About → bottom of dialog.
          </p>
        </div>
      </div>

      <div className="flex gap-2 pt-1 border-t border-border">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
        <button
          onClick={() => sendTest.mutate()}
          disabled={sendTest.isPending || (!form.email_enabled && !form.slack_enabled)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          {sendTest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send test"}
        </button>
      </div>
    </div>
  );
}
