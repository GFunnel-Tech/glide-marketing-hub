import { supabase } from "@/integrations/supabase/client";

const N8N_BASE = "https://apihub.gfunnel.com/webhook";

const post = async (endpoint: string, body?: object) => {
  const res = await fetch(`${N8N_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = parsed?.message || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return parsed;
};

// Sync Meta ads via the Lovable Cloud edge function (the n8n webhook is no
// longer wired up). We resolve the client's workspace so the function only
// refreshes the relevant accounts.
const syncMetaAds = async (clientId: string) => {
  let workspaceId: string | null = null;
  if (clientId && clientId !== "all") {
    const idNum = Number(clientId);
    if (Number.isFinite(idNum)) {
      const { data } = await supabase
        .from("clients")
        .select("workspace_id")
        .eq("id", idNum)
        .maybeSingle();
      workspaceId = (data as any)?.workspace_id ?? null;
    }
  }
  const { data, error } = await supabase.functions.invoke("meta-sync", {
    body: workspaceId ? { workspaceId } : {},
  });
  if (error) throw new Error(error.message || "Sync failed");
  return data;
};

export const api = {
  syncMetaAds,
  syncGHL: (clientId: string) => post("ghl-sync", { clientId }),
  syncAllAccounts: () => post("sync-all"),
  runAudit: (clientId: string) => post("manus-audit", { clientId }),
  swapForm: (clientId: string) => post("form-swap", { clientId }),
  scaleBudget: (clientId: string, campaignIds: string[]) => post("budget-scale", { clientId, campaignIds, percentage: 20 }),
  pauseCampaigns: (clientId: string, campaignIds: string[]) => post("pause-campaigns", { clientId, campaignIds }),
  bulkAction: (
    action: "pause" | "activate" | "delete",
    entity: "campaign" | "adset" | "ad",
    clientId: string,
    ids: string[],
  ) => post(`bulk-${entity}-${action}`, { clientId, ids, action, entity }),
  generateReport: (clientId: string, month: string) => post("generate-report", { clientId, month }),
  exportAllReports: () => post("export-all-reports"),
  getAgentEmbed: (clientId: string) => post("playai-agent", { clientId }),
  sendAIMessage: (message: string, context: object) => post("ai-chat", { message, context }),
};
