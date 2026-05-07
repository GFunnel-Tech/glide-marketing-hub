// Generate a rebill invoice for a client over a date range.
// Sums spend from meta_insights_daily for ad accounts assigned at level='account',
// then applies the client's rebill_config (markup % + fixed fee + monthly minimum).
// Campaign/adset/ad-level assignments are recorded in line_items as informational
// — granular spend requires a future per-campaign insights sync.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Identify user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { clientId, periodStart, periodEnd } = await req.json();
    if (!clientId || !periodStart || !periodEnd) {
      return new Response(JSON.stringify({ error: "clientId, periodStart, periodEnd required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load client + workspace
    const { data: client, error: clientErr } = await supabase
      .from("clients").select("id, workspace_id, name, brand").eq("id", clientId).single();
    if (clientErr || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify workspace membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("role").eq("user_id", userData.user.id).eq("workspace_id", client.workspace_id).maybeSingle();
    if (!member) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load config
    const { data: config } = await supabase
      .from("rebill_configs").select("*")
      .eq("workspace_id", client.workspace_id).eq("client_id", clientId).maybeSingle();
    if (!config || !config.enabled) {
      return new Response(JSON.stringify({ error: "Rebilling not enabled for this client" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load assignments
    const { data: assignments } = await supabase
      .from("rebill_assignments").select("*")
      .eq("workspace_id", client.workspace_id).eq("client_id", clientId);

    const accountAssignments = (assignments ?? []).filter((a) => a.level === "account" && !a.excluded);
    const granularAssignments = (assignments ?? []).filter((a) => a.level !== "account");

    let rawSpend = 0;
    const lineItems: any[] = [];

    if (accountAssignments.length > 0) {
      const adAccountIds = accountAssignments.map((a) => a.ad_account_id);
      const { data: insights } = await supabase
        .from("meta_insights_daily")
        .select("ad_account_id, spend, date")
        .in("ad_account_id", adAccountIds)
        .gte("date", periodStart).lte("date", periodEnd);

      const byAcct = new Map<string, number>();
      (insights ?? []).forEach((row: any) => {
        byAcct.set(row.ad_account_id, (byAcct.get(row.ad_account_id) ?? 0) + Number(row.spend ?? 0));
      });
      accountAssignments.forEach((a) => {
        const spend = byAcct.get(a.ad_account_id) ?? 0;
        rawSpend += spend;
        lineItems.push({
          level: "account", object_id: a.object_id, object_name: a.object_name,
          spend, note: "auto-calculated from meta_insights_daily",
        });
      });
    }

    granularAssignments.forEach((a) => {
      lineItems.push({
        level: a.level, object_id: a.object_id, object_name: a.object_name,
        spend: 0, note: "granular spend sync not yet implemented — enter manually",
      });
    });

    const markup = Number(config.markup_pct);
    const fixedFee = Number(config.fixed_fee);
    const minimum = Number(config.monthly_minimum);
    const subtotal = rawSpend * (markup / 100) + fixedFee;
    const totalDue = Math.max(subtotal, minimum);

    const invoiceNumber = `INV-${client.id}-${periodStart.replace(/-/g, "").slice(0, 6)}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

    const { data: invoice, error: insErr } = await supabase
      .from("rebill_invoices").insert({
        workspace_id: client.workspace_id,
        client_id: clientId,
        period_start: periodStart,
        period_end: periodEnd,
        raw_spend: rawSpend,
        markup_pct: markup,
        fixed_fee: fixedFee,
        monthly_minimum: minimum,
        total_due: totalDue,
        currency: config.currency,
        status: "draft",
        invoice_number: invoiceNumber,
        line_items: lineItems,
      }).select().single();

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, invoice }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
