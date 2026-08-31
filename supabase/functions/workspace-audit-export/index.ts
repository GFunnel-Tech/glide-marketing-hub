// Workspace Audit Export
// Returns a complete JSON snapshot of a workspace, scoped to the caller.
// Time-series tables are filtered to the last N days (default 90).
// Body: { workspaceId: string, daysWindow?: number }
// Response: { workspace, exported_at, scope, counts, tables: { [name]: rows[] }, clients: [{id,name,slug,data:{[table]:rows[]}}] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Tables scoped by workspace_id directly.
const WORKSPACE_TABLES: string[] = [
  "workspaces",
  "workspace_members",
  "workspace_kpi_settings",
  "workspace_embed_tabs",
  "workspace_stripe_accounts",
  "workspace_invitations",
  "clients",
  "campaigns",
  "ad_accounts",
  "meta_ad_accounts",
  "meta_ad_account_clients",
  "meta_ads",
  "meta_connections",
  "meta_form_pipeline_map",
  "meta_lead_form_sync_state",
  "ad_drafts",
  "ad_templates",
  "ad_action_log",
  "reports",
  "client_reports",
  "client_report_schedules",
  "report_templates",
  "leads",
  "manual_leads",
  "google_leads",
  "linkedin_leads",
  "tiktok_leads",
  "onboarding",
  "portal_users",
  "portal_onboarding",
  "client_invites",
  "client_embeds",
  "client_notes",
  "client_kpi_overrides",
  "client_ai_rules",
  "client_status_phases",
  "client_optimization_rules",
  "client_optimization_schedules",
  "client_churn_risk",
  "client_guarantees",
  "client_trend_briefs",
  "client_stripe_accounts",
  "client_wallets",
  "wallet_transactions",
  "rebill_configs",
  "rebill_assignments",
  "rebill_invoices",
  "kpi_threshold_presets",
  "custom_kpis",
  "guarantee_templates",
  "guarantee_evaluations",
  "task_routing_rules",
  "morning_briefs",
  "ai_insights",
  "ai_pending_actions",
  "ai_notification_settings",
  "ai_action_audit_log",
  "integration_configs",
  "ghl_installs",
  "ghl_locations",
  "ghl_appointments",
  "ghl_opportunities",
  "ghl_stage_map",
  "ghl_sync_state",
  "tracking_containers",
  "tracking_pixels",
  "tracking_tags",
  "lead_score_rule_sets",
  "lead_score_calibrations",
  "creative_approvals",
  "account_match_suggestions",
  "archived_entities",
  "activity_log",
  "daily_focus_items",
  "conversations",
  "custom_kpi_alerts",
  "custom_kpi_evaluations",
];

// Tables filtered by `client_id IN clients` (no workspace_id column).
const BY_CLIENT_TABLES: string[] = [
  "meta_leads",
  "meta_insights_daily",
  "meta_insights_granular_daily",
  "lead_scores",
  "lead_score_events",
];

// Tables with `created_at` or natural date column that we cap by window.
const WINDOWED_COLUMNS: Record<string, string> = {
  meta_insights_daily: "date",
  meta_insights_granular_daily: "date",
  meta_leads: "created_time",
  ghl_appointments: "start_time",
  ghl_opportunities: "updated_at",
  leads: "created_at",
  manual_leads: "created_at",
  google_leads: "created_at",
  linkedin_leads: "created_at",
  tiktok_leads: "created_at",
  notifications: "created_at",
  activity_log: "created_at",
  ai_action_audit_log: "occurred_at",
  ai_insights: "created_at",
  ai_pending_actions: "created_at",
  client_notes: "created_at",
  ad_action_log: "created_at",
  wallet_transactions: "created_at",
  rebill_invoices: "created_at",
  morning_briefs: "created_at",
  client_reports: "created_at",
  guarantee_evaluations: "created_at",
  custom_kpi_evaluations: "created_at",
  client_churn_risk: "updated_at",
  client_trend_briefs: "created_at",
  lead_score_events: "created_at",
  creative_approvals: "created_at",
  meta_ads: "updated_at",
  campaigns: "updated_at",
  reports: "created_at",
};

const PAGE_SIZE = 1000;

async function fetchAll(
  admin: ReturnType<typeof createClient>,
  table: string,
  filter: (q: any) => any,
): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  while (true) {
    const q = filter(admin.from(table).select("*").range(from, from + PAGE_SIZE - 1));
    const { data, error } = await q;
    if (error) {
      // Skip tables that don't exist / permission edge cases without breaking the export.
      console.warn(`[audit] ${table} fetch error:`, error.message);
      return out;
    }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const workspaceId: string | undefined = body?.workspaceId;
    const daysWindow: number = Math.min(Math.max(Number(body?.daysWindow ?? 90), 1), 730);
    // "manifest" = workspace + clients + the table plan; "tables" = a slice of tables.
    const mode: string = body?.mode === "tables" ? "tables" : "manifest";
    const requested: string[] = Array.isArray(body?.tables) ? body.tables : [];
    const clientScope: number | null =
      body?.clientId != null && Number.isFinite(Number(body.clientId)) ? Number(body.clientId) : null;
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authorize: workspace member OR super_admin.
    const [{ data: mem }, { data: superRoles }] = await Promise.all([
      admin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle(),
    ]);
    if (!mem && !superRoles) return json({ error: "Forbidden" }, 403);

    const sinceIso = new Date(Date.now() - daysWindow * 86400_000).toISOString();
    const sinceDate = sinceIso.slice(0, 10);

    const windowed = (t: string, q: any) => {
      const col = WINDOWED_COLUMNS[t];
      if (!col) return q;
      return q.gte(col, col === "date" ? sinceDate : sinceIso);
    };

    if (mode === "manifest") {
      const [wsRows, clientRows] = await Promise.all([
        fetchAll(admin, "workspaces", (q) => q.eq("id", workspaceId)),
        fetchAll(admin, "clients", (q) => {
          const base = q.eq("workspace_id", workspaceId);
          return clientScope != null ? base.eq("id", clientScope) : base;
        }),
      ]);
      return json({
        workspace: wsRows[0] ?? null,
        exported_at: new Date().toISOString(),
        exported_by: userId,
        scope: { days_window: daysWindow, since: sinceIso, client_id: clientScope },
        clients: clientRows,
        plan: {
          // A client-scoped export skips workspace-wide tables entirely.
          workspace_tables: clientScope != null
            ? []
            : WORKSPACE_TABLES.filter((t) => t !== "workspaces" && t !== "clients"),
          client_tables: BY_CLIENT_TABLES,
        },
      });
    }

    // mode === "tables": return only the requested slice, keeps each response small.
    const wsSet = new Set(WORKSPACE_TABLES);
    const clientSet = new Set(BY_CLIENT_TABLES);
    const valid = requested.filter((t) => (clientScope != null ? clientSet.has(t) : wsSet.has(t) || clientSet.has(t)));
    if (!valid.length) return json({ tables: {}, counts: {} });

    let clientIds: number[] = [];
    if (valid.some((t) => clientSet.has(t))) {
      if (clientScope != null) {
        const rows = await fetchAll(admin, "clients", (q) =>
          q.eq("workspace_id", workspaceId).eq("id", clientScope),
        );
        clientIds = rows.map((c: any) => c.id);
      } else {
        const rows = await fetchAll(admin, "clients", (q) => q.eq("workspace_id", workspaceId));
        clientIds = rows.map((c: any) => c.id);
      }
    }
    const chunked = <T,>(arr: T[], n: number) => {
      const o: T[][] = [];
      for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n));
      return o;
    };
    const idChunks = chunked(clientIds, 200);

    const tables: Record<string, any[]> = {};
    const counts: Record<string, number> = {};
    // Hard cap per response so a huge time-series table can never blow the worker.
    const MAX_ROWS_PER_RESPONSE = 15000;
    const truncated: Record<string, boolean> = {};

    for (const t of valid) {
      let rows: any[] = [];
      if (wsSet.has(t)) {
        rows = await fetchAll(admin, t, (q) =>
          windowed(t, t === "workspaces" ? q.eq("id", workspaceId) : q.eq("workspace_id", workspaceId)),
        );
      } else {
        for (const chunk of idChunks) {
          const part = await fetchAll(admin, t, (q) => windowed(t, q.in("client_id", chunk)));
          rows.push(...part);
          if (rows.length >= MAX_ROWS_PER_RESPONSE) break;
        }
      }
      if (rows.length > MAX_ROWS_PER_RESPONSE) {
        rows = rows.slice(0, MAX_ROWS_PER_RESPONSE);
        truncated[t] = true;
      }
      tables[t] = rows;
      counts[t] = rows.length;
    }

    return json({ tables, counts, truncated });
  } catch (e) {
    console.error("[workspace-audit-export] fatal", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
