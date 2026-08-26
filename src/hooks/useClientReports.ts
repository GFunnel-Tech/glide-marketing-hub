import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface ReportSchedule {
  id: string;
  workspace_id: string;
  client_id: number;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour: number | null;
  recipients: string[];
  active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
}

export interface GeneratedReport {
  id: string;
  client_id: number;
  period_start: string;
  period_end: string;
  status: string;
  commentary: string | null;
  pdf_url: string | null;
  share_token: string | null;
  recipients: string[] | null;
  error_message: string | null;
  generated_at: string | null;
  sent_at: string | null;
  trigger_type: string | null;
  payload: any;
}

export function useReportSchedules() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["client_report_schedules", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_report_schedules")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        recipients: Array.isArray(s.recipients) ? s.recipients : [],
      })) as ReportSchedule[];
    },
  });
}

export function useGeneratedReports() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  return useQuery({
    queryKey: ["client_reports", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_reports")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("generated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as GeneratedReport[];
    },
  });
}

function nextRunFrom(cadence: string, dayOfWeek: number, dayOfMonth: number, sendHour: number) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(sendHour, 0, 0, 0);
  if (cadence === "daily") {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  } else if (cadence === "weekly") {
    const delta = ((dayOfWeek - next.getUTCDay() + 7) % 7) || (next <= now ? 7 : 0);
    next.setUTCDate(next.getUTCDate() + delta);
  } else {
    next.setUTCDate(dayOfMonth);
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next.toISOString();
}

export function useSaveSchedule() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      client_id: number;
      cadence: string;
      day_of_week: number;
      day_of_month: number;
      send_hour: number;
      recipients: string[];
      active: boolean;
    }) => {
      const row = {
        workspace_id: currentWorkspace!.id,
        client_id: input.client_id,
        cadence: input.cadence,
        day_of_week: input.cadence === "weekly" ? input.day_of_week : null,
        day_of_month: input.cadence === "monthly" ? input.day_of_month : null,
        send_hour: input.send_hour,
        recipients: input.recipients,
        active: input.active,
        next_run_at: nextRunFrom(input.cadence, input.day_of_week, input.day_of_month, input.send_hour),
      };
      const q = input.id
        ? supabase.from("client_report_schedules").update(row).eq("id", input.id)
        : supabase.from("client_report_schedules").insert(row as any);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_report_schedules"] }),
  });
}

export function useToggleSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("client_report_schedules").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_report_schedules"] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_report_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_report_schedules"] }),
  });
}

/** Generate a report PDF (and optionally email it right away). */
export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientId: number;
      periodStart?: string;
      periodEnd?: string;
      recipients?: string[];
      send?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke("report-generate", {
        body: {
          clientId: input.clientId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          recipients: input.recipients ?? [],
          send: input.send ?? false,
          triggerType: "manual",
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_reports"] }),
  });
}

/** Email an already-generated report to its recipients. */
export function useDeliverReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, recipients }: { reportId: string; recipients?: string[] }) => {
      const { data, error } = await supabase.functions.invoke("report-deliver", {
        body: { reportId, recipients },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.ok === false) throw new Error((data as any).error || "Delivery failed");
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_reports"] }),
  });
}
