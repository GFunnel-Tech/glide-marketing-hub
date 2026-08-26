// Emails a generated client report (PDF link + share link) to its recipients.
// Body: { reportId, recipients? }
// Callable by the scheduler (service role) or by a workspace member (JWT).
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
const APP_URL = Deno.env.get("APP_URL") || "https://metahub.gfunnel.com";

const money = (n: number, cur: string) =>
  `${cur === "USD" ? "$" : cur + " "}${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const reportId = body.reportId;
    if (!reportId) return json({ error: "reportId required" }, 400);

    const { data: rep } = await supabase
      .from("client_reports")
      .select("*, clients(name, brand, currency_code)")
      .eq("id", reportId)
      .maybeSingle();
    if (!rep) return json({ error: "report not found" }, 404);

    // Service-role callers skip the membership check; user callers must belong
    // to the report's workspace.
    const authHeader = req.headers.get("Authorization") ?? "";
    const isService = authHeader === `Bearer ${SERVICE_KEY}`;
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "unauthorized" }, 401);
      const { data: member } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", rep.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member) return json({ error: "forbidden" }, 403);
    }

    let recipients: string[] = Array.isArray(body.recipients) && body.recipients.length
      ? body.recipients
      : Array.isArray(rep.recipients)
        ? (rep.recipients as string[])
        : [];
    recipients = recipients.filter((e) => typeof e === "string" && e.includes("@"));

    if (!recipients.length && rep.schedule_id) {
      const { data: sched } = await supabase
        .from("client_report_schedules")
        .select("recipients")
        .eq("id", rep.schedule_id)
        .maybeSingle();
      recipients = ((sched?.recipients as string[]) ?? []).filter((e) => e?.includes("@"));
    }
    if (!recipients.length) {
      await supabase
        .from("client_reports")
        .update({ error_message: "No recipients configured" })
        .eq("id", reportId);
      return json({ ok: false, error: "No recipients configured for this report" }, 400);
    }

    const c: any = (rep as any).clients ?? {};
    const cur = c.currency_code || "USD";
    const totals = (rep.payload as any)?.totals ?? {};
    const shareUrl = `${APP_URL}/r/${rep.share_token}`;
    const clientName = c.brand || c.name || "your account";

    const results: { email: string; ok: boolean; error?: string }[] = [];
    for (const email of recipients) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            templateName: "client-report",
            recipientEmail: email,
            idempotencyKey: `client-report-${rep.id}-${email}`,
            templateData: {
              clientName,
              periodStart: rep.period_start,
              periodEnd: rep.period_end,
              spend: money(totals.spend ?? 0, cur),
              leads: String(Math.round(totals.leads ?? 0)),
              cpl: totals.leads ? money(totals.cpl ?? 0, cur) : "—",
              commentary: rep.commentary ?? "",
              reportUrl: shareUrl,
              pdfUrl: rep.pdf_url ?? shareUrl,
            },
          }),
        });
        if (r.ok) results.push({ email, ok: true });
        else results.push({ email, ok: false, error: `${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` });
      } catch (e) {
        results.push({ email, ok: false, error: String(e).slice(0, 200) });
      }
    }

    const sent = results.filter((r) => r.ok);
    if (sent.length) {
      await supabase
        .from("client_reports")
        .update({
          status: "delivered",
          sent_at: new Date().toISOString(),
          recipients,
          email_message_ids: results,
          error_message: sent.length === results.length ? null : "Some recipients failed",
        })
        .eq("id", reportId);
      return json({ ok: true, sent: sent.length, results });
    }

    const errMsg =
      results[0]?.error?.includes("404") || results[0]?.error?.includes("Failed to fetch")
        ? "Email sending isn't set up yet — finish email domain setup, then retry."
        : results[0]?.error || "Delivery failed";
    await supabase.from("client_reports").update({ error_message: errMsg.slice(0, 500) }).eq("id", reportId);
    return json({ ok: false, error: errMsg, results }, 502);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
