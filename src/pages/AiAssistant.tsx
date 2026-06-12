import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClients } from "@/hooks/useDatabase";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useClientPath } from "@/lib/clientPath";
import { supabase } from "@/integrations/supabase/client";
import { Bot, ExternalLink, Zap, Activity, MessageSquare, Settings as SettingsIcon } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { OptimizationRulesPanel } from "@/components/ai/OptimizationRulesPanel";
import { OptimizationSchedulePanel } from "@/components/ai/OptimizationSchedulePanel";
import { NotificationSettingsPanel } from "@/components/ai/NotificationSettingsPanel";
import { AiAuditLogPanel } from "@/components/ai/AiAuditLogPanel";
import { AgentChat } from "@/components/ai/AgentChat";
import { ClientPicker } from "@/components/ai/ClientPicker";
import { PendingActionsPanel } from "@/components/ai/PendingActionsPanel";
import { KnowledgeBasePanel } from "@/components/ai/KnowledgeBasePanel";
import { AiInsightsFeed } from "@/components/ai/AiInsightsFeed";
import { PortfolioSnapshot } from "@/components/ai/PortfolioSnapshot";

const perClientSuggestions = [
  "Audit this account's ad performance",
  "Pause the 10 worst-performing ads to lower CPM",
  "Which ad sets should I scale up?",
  "Generate this month's report for the selected client",
  "Compare my top creatives against my other clients",
];

const portfolioSuggestions = [
  "Which 3 clients need attention right now?",
  "Forecast end-of-month for every client at risk of missing guarantee",
  "Rank clients by CPL week-over-week change",
  "Show me every critical anomaly across the portfolio",
  "Compare my best client vs my worst on CPL, CTR, and frequency",
];

export default function AiAssistant() {
  const { currentWorkspace } = useWorkspace();
  const clientPath = useClientPath();
  const workspaceId = currentWorkspace?.id;
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const qc = useQueryClient();

  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  const toggleAutonomous = useMutation({
    mutationFn: async (next: boolean) => {
      if (!selectedClient) return;
      const { error } = await supabase
        .from("clients")
        .update({ autonomous_optimization: next })
        .eq("id", selectedClient.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Updated optimization mode");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const detectClient = (text: string) => {
    const lower = text.toLowerCase();
    return clients.find(
      (c) => lower.includes(c.name.toLowerCase()) || (c.brand && lower.includes(c.brand.toLowerCase())),
    )?.id;
  };

  if (!workspaceId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            AI Operations
          </h1>
          <p className="text-sm text-muted-foreground">
            Portfolio-wide intelligence · forecasts, anomalies, and safe auto-actions across every client.
          </p>
        </div>
      </div>

      <Tabs defaultValue="operations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="operations" className="gap-1.5">
            <Activity className="h-4 w-4" /> Operations
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageSquare className="h-4 w-4" /> Chat
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <SettingsIcon className="h-4 w-4" /> Settings
          </TabsTrigger>
        </TabsList>

        {/* ───── OPERATIONS ───── */}
        <TabsContent value="operations" className="space-y-4">
          <PortfolioSnapshot workspaceId={workspaceId} />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <AiInsightsFeed workspaceId={workspaceId} />
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">Ask the AI about your portfolio</h3>
                  <p className="text-[11px] text-muted-foreground">Knows every client's spend, leads, CPL, anomalies and forecasts.</p>
                </div>
                <AgentChat
                  key={`portfolio-${workspaceId}`}
                  workspaceId={workspaceId}
                  clientId={selectedClientId}
                  endpoint="ai-ops-chat"
                  contextLabel="your portfolio"
                  suggestions={portfolioSuggestions}
                  detectClient={detectClient}
                  onClientDetected={setSelectedClientId}
                  className="h-[420px] border-0 rounded-none rounded-b-xl"
                />
              </div>
            </div>
            <div className="space-y-4">
              <PendingActionsPanel workspaceId={workspaceId} clientId={null} />
              <AiAuditLogPanel workspaceId={workspaceId} clientId={selectedClient?.id} />
            </div>
          </div>
        </TabsContent>

        {/* ───── CHAT (per-client agent, original) ───── */}
        <TabsContent value="chat">
          <div className="flex gap-6 h-[calc(100vh-14rem)]">
            <div className="flex-[65] flex flex-col rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-3">
                  <Bot className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Per-client Agent</h2>
                    <p className="text-xs text-muted-foreground">
                      Pick a client, then audit, optimize, report, or act on Meta
                    </p>
                  </div>
                </div>
                <ClientPicker
                  clients={clients}
                  value={selectedClientId}
                  onChange={setSelectedClientId}
                  isLoading={clientsLoading}
                />
              </div>
              <AgentChat
                key={`per-client-${workspaceId}`}
                workspaceId={workspaceId}
                clientId={selectedClientId}
                contextLabel={selectedClient?.name}
                suggestions={perClientSuggestions}
                detectClient={detectClient}
                onClientDetected={setSelectedClientId}
                className="flex-1 border-0 rounded-none"
              />
            </div>

            <div className="flex-[35] space-y-4 overflow-auto">
              {selectedClient ? (
                <div className="rounded-lg border border-border bg-card p-5">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Active Client</h3>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
                    <StatusBadge status={selectedClient.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div><span className="text-muted-foreground">CPL</span><p className="font-semibold">${(selectedClient.cpl ?? 0).toFixed(2)}</p></div>
                    <div><span className="text-muted-foreground">Leads</span><p className="font-semibold">{selectedClient.leads ?? 0}</p></div>
                    <div><span className="text-muted-foreground">Form CVR</span><p className="font-semibold">{(selectedClient.formCvr ?? 0).toFixed(2)}%</p></div>
                    <div><span className="text-muted-foreground">Spend</span><p className="font-semibold">${(selectedClient.spend ?? 0).toLocaleString()}</p></div>
                  </div>
                  <div className="rounded-md border border-border bg-background p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5 text-warning" /> Autonomous optimization
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {(selectedClient as any).autonomousOptimization
                            ? "AI executes changes immediately on Meta"
                            : "AI proposals queue for your approval"}
                        </p>
                      </div>
                      <Switch
                        checked={!!(selectedClient as any).autonomousOptimization}
                        onCheckedChange={(v) => toggleAutonomous.mutate(v)}
                      />
                    </div>
                  </div>
                  <Link to={clientPath(selectedClient.id)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    Open Client Profile <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <AiInsightsFeed workspaceId={workspaceId} showScan={false} limit={20} />
              )}
              <PendingActionsPanel workspaceId={workspaceId} clientId={selectedClientId} />
            </div>
          </div>
        </TabsContent>

        {/* ───── SETTINGS ───── */}
        <TabsContent value="settings" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <NotificationSettingsPanel workspaceId={workspaceId} />
              <KnowledgeBasePanel workspaceId={workspaceId} clientId={selectedClient?.id ?? null} clientName={selectedClient?.name} />
            </div>
            <div className="space-y-4">
              {selectedClient ? (
                <>
                  <OptimizationRulesPanel clientId={selectedClient.id} workspaceId={workspaceId} />
                  <OptimizationSchedulePanel clientId={selectedClient.id} workspaceId={workspaceId} />
                </>
              ) : (
                <div className="rounded-xl border border-border bg-card p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Pick a client in the <span className="font-medium">Chat</span> tab to configure optimization rules and schedule.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
