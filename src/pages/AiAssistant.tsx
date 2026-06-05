import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClients } from "@/hooks/useDatabase";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { Bot, ExternalLink, Zap } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { OptimizationRulesPanel } from "@/components/ai/OptimizationRulesPanel";
import { OptimizationSchedulePanel } from "@/components/ai/OptimizationSchedulePanel";
import { NotificationSettingsPanel } from "@/components/ai/NotificationSettingsPanel";
import { AiAuditLogPanel } from "@/components/ai/AiAuditLogPanel";
import { AgentChat } from "@/components/ai/AgentChat";
import { ClientPicker } from "@/components/ai/ClientPicker";
import { PendingActionsPanel } from "@/components/ai/PendingActionsPanel";
import { KnowledgeBasePanel } from "@/components/ai/KnowledgeBasePanel";

const suggestions = [
  "Audit this account's ad performance",
  "Pause the 10 worst-performing ads to lower CPM",
  "We have 160 combinations — get it down to ~46 by pausing the worst",
  "Which ad sets should I scale up?",
  "Generate this month's report for the selected client",
  "Compare my top creatives against my other clients",
];

export default function AiAssistant() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const qc = useQueryClient();

  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  // Autonomous toggle
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

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Chat column */}
      <div className="flex-[65] flex flex-col rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Meta Ads AI Agent</h2>
              <p className="text-xs text-muted-foreground">
                Powered by Claude · reads every client, pulls & compares ads, reports, and acts on Meta
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success ml-2" />
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

        {workspaceId && (
          <AgentChat
            key={workspaceId}
            workspaceId={workspaceId}
            clientId={selectedClientId}
            contextLabel={selectedClient?.name}
            suggestions={suggestions}
            detectClient={detectClient}
            onClientDetected={setSelectedClientId}
            className="flex-1 border-0 rounded-none"
          />
        )}
      </div>

      {/* Right rail */}
      <div className="flex-[35] space-y-4 overflow-auto">
        {selectedClient ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Active Client</h3>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
              <StatusBadge status={selectedClient.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div>
                <span className="text-muted-foreground">CPL</span>
                <p className="font-semibold">${(selectedClient.cpl ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Leads</span>
                <p className="font-semibold">{selectedClient.leads ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Form CVR</span>
                <p className="font-semibold">{(selectedClient.formCvr ?? 0).toFixed(2)}%</p>
              </div>
              <div>
                <span className="text-muted-foreground">Spend</span>
                <p className="font-semibold">${(selectedClient.spend ?? 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-background p-3 mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-warning" />
                    Autonomous optimization
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

            <Link
              to={`/client/${selectedClient.id}`}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Open Client Profile <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-5 text-center">
            <p className="text-xs text-muted-foreground">Pick a client to enable optimization</p>
          </div>
        )}

        {selectedClient && workspaceId && (
          <>
            <OptimizationRulesPanel clientId={selectedClient.id} workspaceId={workspaceId} />
            <OptimizationSchedulePanel clientId={selectedClient.id} workspaceId={workspaceId} />
          </>
        )}

        {workspaceId && (
          <KnowledgeBasePanel
            workspaceId={workspaceId}
            clientId={selectedClient?.id ?? null}
            clientName={selectedClient?.name}
          />
        )}

        {workspaceId && <NotificationSettingsPanel workspaceId={workspaceId} />}

        {workspaceId && <AiAuditLogPanel workspaceId={workspaceId} clientId={selectedClient?.id} />}

        {workspaceId && <PendingActionsPanel workspaceId={workspaceId} clientId={selectedClientId} />}
      </div>
    </div>
  );
}
