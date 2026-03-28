const N8N_BASE = "https://apihub.gfunnel.com/webhook";

const post = (endpoint: string, body?: object) =>
  fetch(`${N8N_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());

export const api = {
  syncMetaAds: (clientId: string) => post("meta-ads-sync", { clientId }),
  syncGHL: (clientId: string) => post("ghl-sync", { clientId }),
  syncAllAccounts: () => post("sync-all"),
  runAudit: (clientId: string) => post("manus-audit", { clientId }),
  swapForm: (clientId: string) => post("form-swap", { clientId }),
  scaleBudget: (clientId: string, campaignIds: string[]) => post("budget-scale", { clientId, campaignIds, percentage: 20 }),
  pauseCampaigns: (clientId: string, campaignIds: string[]) => post("pause-campaigns", { clientId, campaignIds }),
  generateReport: (clientId: string, month: string) => post("generate-report", { clientId, month }),
  exportAllReports: () => post("export-all-reports"),
  getAgentEmbed: (clientId: string) => post("playai-agent", { clientId }),
  sendAIMessage: (message: string, context: object) => post("ai-chat", { message, context }),
};
