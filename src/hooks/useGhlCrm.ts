import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export type GhlContact = {
  id: string;
  location_id: string;
  client_id: number | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  source: string | null;
  assigned_to: string | null;
  dnd: boolean;
  date_added: string | null;
  date_updated: string | null;
};

export type GhlContactNote = {
  id: string;
  contact_id: string;
  body: string | null;
  created_by: string | null;
  date_added: string | null;
};

export type GhlContactTask = {
  id: string;
  contact_id: string;
  title: string | null;
  body: string | null;
  due_date: string | null;
  completed: boolean;
  assigned_to: string | null;
};

export type GhlPipeline = { id: string; name: string | null; location_id: string };
export type GhlPipelineStage = {
  id: string;
  pipeline_id: string;
  name: string | null;
  position: number | null;
};

const digits = (v?: string | null) => (v ?? "").replace(/\D+/g, "");

/**
 * Resolve the GHL contact behind a lead: by stored contact id first, then by
 * email, then by the last 10 digits of the phone number.
 */
export function useGhlContactForLead(lead: {
  id?: string;
  ghl_contact_id?: string | null;
  email?: string | null;
  phone?: string | null;
  client_id?: number | null;
} | null) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const key = lead?.ghl_contact_id || lead?.email || lead?.phone || null;

  return useQuery({
    queryKey: ["ghl-contact-for-lead", wsId, lead?.client_id ?? null, key],
    enabled: !!wsId && !!key,
    queryFn: async (): Promise<GhlContact | null> => {
      const base = () =>
        (supabase as any).from("ghl_contacts").select("*").eq("workspace_id", wsId);

      if (lead?.ghl_contact_id) {
        const { data } = await base().eq("id", lead.ghl_contact_id).maybeSingle();
        if (data) return data as GhlContact;
      }
      if (lead?.email) {
        const { data } = await base().ilike("email", lead.email.trim()).limit(1);
        if (data?.length) return data[0] as GhlContact;
      }
      const d = digits(lead?.phone);
      if (d.length >= 10) {
        const { data } = await base().ilike("phone", `%${d.slice(-10)}%`).limit(1);
        if (data?.length) return data[0] as GhlContact;
      }
      return null;
    },
  });
}

export function useGhlContactActivity(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ["ghl-contact-activity", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<{ notes: GhlContactNote[]; tasks: GhlContactTask[] }> => {
      const [n, t] = await Promise.all([
        (supabase as any)
          .from("ghl_contact_notes")
          .select("id, contact_id, body, created_by, date_added")
          .eq("contact_id", contactId)
          .order("date_added", { ascending: false })
          .limit(50),
        (supabase as any)
          .from("ghl_contact_tasks")
          .select("id, contact_id, title, body, due_date, completed, assigned_to")
          .eq("contact_id", contactId)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(50),
      ]);
      return { notes: (n.data ?? []) as GhlContactNote[], tasks: (t.data ?? []) as GhlContactTask[] };
    },
  });
}

export function useGhlPipelines(clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;

  return useQuery({
    queryKey: ["ghl-pipelines", wsId, clientId ?? "all"],
    enabled: !!wsId,
    queryFn: async (): Promise<{ pipelines: GhlPipeline[]; stages: GhlPipelineStage[] }> => {
      let pq = (supabase as any)
        .from("ghl_pipelines")
        .select("id, name, location_id")
        .eq("workspace_id", wsId);
      if (clientId !== undefined) pq = pq.eq("client_id", clientId);
      const { data: pipelines } = await pq;
      const ids = (pipelines ?? []).map((p: any) => p.id);
      let stages: GhlPipelineStage[] = [];
      if (ids.length) {
        const { data } = await (supabase as any)
          .from("ghl_pipeline_stages")
          .select("id, pipeline_id, name, position")
          .in("pipeline_id", ids)
          .order("position", { ascending: true });
        stages = (data ?? []) as GhlPipelineStage[];
      }
      return { pipelines: (pipelines ?? []) as GhlPipeline[], stages };
    },
  });
}

export function useGhlClientSummary(clientId?: number) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;

  return useQuery({
    queryKey: ["ghl-client-summary", wsId, clientId],
    enabled: !!wsId && !!clientId,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [contacts, tasks, appts, state, recent] = await Promise.all([
        (supabase as any)
          .from("ghl_contacts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId)
          .eq("client_id", clientId),
        (supabase as any)
          .from("ghl_contact_tasks")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId)
          .eq("client_id", clientId)
          .eq("completed", false),
        (supabase as any)
          .from("ghl_appointments")
          .select("id, title, start_time, status, calendar_name, assigned_user_name")
          .eq("workspace_id", wsId)
          .eq("client_id", clientId)
          .gte("start_time", nowIso)
          .order("start_time", { ascending: true })
          .limit(10),
        (supabase as any)
          .from("ghl_sync_state")
          .select("last_contacts_sync_at, last_run_at, last_error")
          .eq("workspace_id", wsId)
          .eq("client_id", clientId)
          .maybeSingle(),
        (supabase as any)
          .from("ghl_contacts")
          .select("id, full_name, email, phone, tags, source, date_added")
          .eq("workspace_id", wsId)
          .eq("client_id", clientId)
          .order("date_added", { ascending: false, nullsFirst: false })
          .limit(10),
      ]);

      return {
        contactCount: contacts.count ?? 0,
        openTaskCount: tasks.count ?? 0,
        upcoming: (appts.data ?? []) as any[],
        recentContacts: (recent.data ?? []) as GhlContact[],
        lastSyncAt: (state.data?.last_contacts_sync_at as string | null) ?? null,
        lastError: (state.data?.last_error as string | null) ?? null,
      };
    },
  });
}

export function useRunGhlSync() {
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (opts: { clientId?: number; full?: boolean } = {}) => {
      if (!currentWorkspace?.id) throw new Error("Workspace not loaded");
      const { data, error } = await supabase.functions.invoke("ghl-full-sync", {
        body: { workspaceId: currentWorkspace.id, clientId: opts.clientId, full: opts.full },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: (data) => {
      const totals = (data?.results ?? []).reduce(
        (a: any, r: any) => ({
          contacts: a.contacts + (r.contacts ?? 0),
          notes: a.notes + (r.notes ?? 0),
          tasks: a.tasks + (r.tasks ?? 0),
        }),
        { contacts: 0, notes: 0, tasks: 0 },
      );
      toast.success(
        `GHL sync complete — ${totals.contacts} contacts, ${totals.notes} notes, ${totals.tasks} tasks`,
      );
      if (data?.errors?.length) {
        toast.warning(`${data.errors.length} location(s) reported issues — see the sync panel.`);
      }
      qc.invalidateQueries({ queryKey: ["ghl-client-summary"] });
      qc.invalidateQueries({ queryKey: ["ghl-pipelines"] });
      qc.invalidateQueries({ queryKey: ["ghl-contact-for-lead"] });
      qc.invalidateQueries({ queryKey: ["ghl-contact-activity"] });
    },
    onError: (e: any) => toast.error(e?.message || "GHL sync failed"),
  });
}
