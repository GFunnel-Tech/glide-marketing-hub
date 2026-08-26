import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export type GhlAuditIssue = {
  severity: "critical" | "warning" | "info";
  area: "auth" | "data" | "pipeline";
  message: string;
};

export type GhlAuditAccount = {
  clientId: number;
  clientName: string | null;
  status: string | null;
  locationId: string;
  locationName: string | null;
  auth: {
    hasToken: boolean;
    tokenType: string;
    locationKnown: boolean;
    lastLocationSyncAt: string | null;
    lastRunAt: string | null;
    lastContactsSyncAt: string | null;
    lastApptsSyncAt: string | null;
    lastError: string | null;
  };
  crm: {
    contacts: number;
    contactsMissingEmail: number;
    contactsMissingPhone: number;
    contactsMissingTags: number;
    contactsWithNotes: number;
    contactsWithoutNotes: number;
    notes: number;
    newestContactAt: string | null;
    newestNoteAt: string | null;
    leads30d: number;
    leadsNotInGhl30d: number;
    leadSyncErrors30d: number;
  };
  pipeline: {
    pipelines: number;
    opportunities: number;
    openOpportunities: number;
    staleOpportunities: number;
    openValue: number;
    openTasks: number;
    overdueTasks: number;
    upcomingAppointments: number;
    pastAppointments60d: number;
    noShows60d: number;
  };
  issues: GhlAuditIssue[];
};

export type GhlAuditReport = {
  generatedAt: string;
  workspaceId: string;
  hasAgencyKey: boolean;
  accounts: GhlAuditAccount[];
};

/** Health score 0-100: criticals cost 25, warnings 10, info 3. */
export function ghlAuditScore(a: GhlAuditAccount): number {
  const cost = a.issues.reduce(
    (n, i) => n + (i.severity === "critical" ? 25 : i.severity === "warning" ? 10 : 3),
    0,
  );
  return Math.max(0, 100 - cost);
}

export function useGhlAudit(clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;

  return useQuery({
    queryKey: ["ghl-audit", wsId, clientId ?? "all"],
    enabled: !!wsId,
    staleTime: 60_000,
    queryFn: async (): Promise<GhlAuditReport> => {
      const { data, error } = await (supabase as any).rpc("ghl_account_audit", {
        _workspace_id: wsId,
        _client_id: clientId ?? null,
      });
      if (error) throw error;
      return data as GhlAuditReport;
    },
  });
}

export function ghlAuditToCsv(accounts: GhlAuditAccount[]): string {
  const head = [
    "Client", "Status", "Location ID", "Location name", "Health score",
    "Token type", "Last sync", "Last error",
    "Contacts", "Missing email", "Missing phone", "Contacts without notes",
    "Leads 30d", "Leads not in GHL 30d", "Lead sync errors 30d",
    "Pipelines", "Open opps", "Stale opps", "Open value",
    "Open tasks", "Overdue tasks", "Upcoming appts", "No-shows 60d",
    "Issues",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = accounts.map((a) => [
    a.clientName, a.status, a.locationId, a.locationName, ghlAuditScore(a),
    a.auth.tokenType,
    a.auth.lastContactsSyncAt ? new Date(a.auth.lastContactsSyncAt).toISOString() : "",
    a.auth.lastError ?? "",
    a.crm.contacts, a.crm.contactsMissingEmail, a.crm.contactsMissingPhone, a.crm.contactsWithoutNotes,
    a.crm.leads30d, a.crm.leadsNotInGhl30d, a.crm.leadSyncErrors30d,
    a.pipeline.pipelines, a.pipeline.openOpportunities, a.pipeline.staleOpportunities, a.pipeline.openValue,
    a.pipeline.openTasks, a.pipeline.overdueTasks, a.pipeline.upcomingAppointments, a.pipeline.noShows60d,
    a.issues.map((i) => `${i.severity}: ${i.message}`).join(" | "),
  ].map(esc).join(","));
  return [head.map(esc).join(","), ...rows].join("\n");
}
