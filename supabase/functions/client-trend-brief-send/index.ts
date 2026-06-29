// Sends an approved client trend brief.
// If the project's transactional email infra (`send-transactional-email`) is set up,
// it forwards the brief there. Otherwise it marks the brief sent=false with a clear
// error so the UI can prompt the user to finish email setup. Authenticated workspace
// members only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function mdToHtml(md: string): string {
  // Minimal markdown → HTML (paragraphs + bold + italic + links).
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = md.trim().split(/\n{2,}/).map((p) => {
    let h = esc(p)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, "<br/>");
    return `<p style="margin:0 0 16px 0;line-height:1.55;color:#0f172a;font-size:15px">${h}</p>`;
  });
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0f172a">${blocks.join("")}</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { briefId } = await req.json();
    if (!briefId) return json({ error: "briefId required" }, 400);

    const { data: brief } = await supabase
      .from("client_trend_briefs")
      .select("*, clients!inner(name)")
      .eq("id", briefId)
      .maybeSingle();
    if (!brief) return json({ error: "not found" }, 404);

    // Verify membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", brief.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);

    if (brief.status === "sent") return json({ ok: true, already: true });
    if (!brief.recipients?.length) {
      await supabase.from("client_trend_briefs").update({ status: "failed", error: "No recipients configured" }).eq("id", briefId);
      return json({ error: "No recipients configured for this client" }, 400);
    }

    const html = brief.body_html || mdToHtml(brief.body_markdown);

    // Try transactional pipeline
    let sent = false;
    let errMsg: string | null = null;
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: "client-trend-brief",
          recipientEmail: brief.recipients[0],
          idempotencyKey: `trend-brief-${brief.id}`,
          templateData: {
            subject: brief.subject,
            html,
            clientName: (brief as any).clients?.name ?? "your account",
          },
        }),
      });
      if (r.ok) sent = true;
      else errMsg = `Email pipeline returned ${r.status}: ${await r.text().catch(() => "")}`.slice(0, 500);
    } catch (e) {
      errMsg = `Email pipeline not available: ${String(e)}`.slice(0, 500);
    }

    if (sent) {
      await supabase.from("client_trend_briefs").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", briefId);
      return json({ ok: true });
    }
    await supabase.from("client_trend_briefs").update({ status: "failed", error: errMsg }).eq("id", briefId);
    return json({ ok: false, error: errMsg || "Email infrastructure not ready. Finish email domain setup, then retry." }, 502);
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
