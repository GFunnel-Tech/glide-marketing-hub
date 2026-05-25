// Sends notifications to Slack + email when AI agent queues or executes actions.
// Body: { event: 'queued'|'executed', action_id, workspace_id, client_id?, action_type, reasoning?, payload? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");

const APP_BASE_URL = "https://metahub.gfunnel.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { event, action_id, workspace_id, client_id, action_type, reasoning, payload } = body as any;
    if (!event || !workspace_id || !action_type) return json({ error: "missing fields" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load settings
    const { data: settings } = await admin
      .from("ai_notification_settings")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    if (!settings) return json({ skipped: "no settings" });

    // Filter by alert_on
    const wantsEvent =
      settings.alert_on === "both" ||
      (settings.alert_on === "queued" && event === "queued") ||
      (settings.alert_on === "executed" && event === "executed");
    if (!wantsEvent) return json({ skipped: "event filtered" });

    // Resolve client + workspace info
    const [clientRes, wsRes] = await Promise.all([
      client_id
        ? admin.from("clients").select("name,brand").eq("id", client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("workspaces").select("name").eq("id", workspace_id).maybeSingle(),
    ]);
    const clientName = (clientRes as any).data?.name ?? "—";
    const wsName = (wsRes as any).data?.name ?? "Workspace";

    const title =
      event === "queued"
        ? `AI queued ${action_type} for approval`
        : `AI executed ${action_type} on Meta`;
    const subject = `[${wsName}] ${title} · ${clientName}`;
    const reasonText = reasoning?.trim() || "(no reasoning provided)";
    const link = `${APP_BASE_URL}/ai`;

    const results: Record<string, any> = {};

    // ---------- Slack ----------
    if (settings.slack_enabled && settings.slack_channel_id && SLACK_API_KEY && LOVABLE_API_KEY) {
      try {
        const blocks = [
          { type: "header", text: { type: "plain_text", text: title } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Client:*\n${clientName}` },
              { type: "mrkdwn", text: `*Action:*\n\`${action_type}\`` },
              { type: "mrkdwn", text: `*Event:*\n${event}` },
              { type: "mrkdwn", text: `*Workspace:*\n${wsName}` },
            ],
          },
          { type: "section", text: { type: "mrkdwn", text: `*Reasoning:*\n${reasonText.slice(0, 1500)}` } },
          {
            type: "section",
            text: { type: "mrkdwn", text: `<${link}|Open AI Assistant →>` },
          },
        ];
        const r = await fetch("https://connector-gateway.lovable.dev/slack/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": SLACK_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: settings.slack_channel_id,
            text: title,
            blocks,
          }),
        });
        const j = await r.json();
        results.slack = { ok: j.ok === true, error: j.error };
      } catch (e: any) {
        results.slack = { ok: false, error: e?.message };
      }
    } else {
      results.slack = { skipped: true };
    }

    // ---------- Email ----------
    if (settings.email_enabled) {
      const recipients = new Set<string>();
      (settings.extra_email_recipients ?? []).forEach((e: string) => e && recipients.add(e.trim()));
      if (settings.notify_workspace_members) {
        const { data: members } = await admin
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", workspace_id);
        const ids = (members ?? []).map((m: any) => m.user_id);
        if (ids.length) {
          const { data: profs } = await admin
            .from("profiles")
            .select("email")
            .in("id", ids);
          (profs ?? []).forEach((p: any) => p.email && recipients.add(p.email));
        }
      }

      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <h2 style="margin:0 0 12px;color:#ea580c">${title}</h2>
          <p style="color:#64748b;margin:0 0 16px">${wsName} · ${clientName}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#64748b">Action</td><td><code>${action_type}</code></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Event</td><td>${event}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Client</td><td>${clientName}</td></tr>
          </table>
          <div style="margin:16px 0;padding:12px;background:#f1f5f9;border-radius:8px">
            <strong style="display:block;margin-bottom:6px">Reasoning</strong>
            <span style="color:#334155;white-space:pre-wrap">${escapeHtml(reasonText)}</span>
          </div>
          <a href="${link}" style="display:inline-block;background:#ea580c;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">Open AI Assistant</a>
        </div>`;

      const emailResults: any[] = [];
      for (const to of recipients) {
        try {
          // Try Lovable Emails transactional function (if configured)
          const r = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({
              to,
              subject,
              html,
              purpose: "transactional",
              template_name: "ai-agent-alert",
              idempotency_key: `ai-notify-${action_id}-${to}`,
            }),
          });
          emailResults.push({ to, status: r.status });
        } catch (e: any) {
          emailResults.push({ to, error: e?.message });
        }
      }
      results.email = { recipients: [...recipients], results: emailResults };
    } else {
      results.email = { skipped: true };
    }

    return json({ ok: true, results });
  } catch (e: any) {
    console.error("ai-notify fatal", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
