import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

/**
 * Mutations for the agency's own sales pipeline (C1).
 *
 * A prospect is a `clients` row with `lifecycle = 'prospect'`, so everything
 * that already hangs off a client — notes, tasks, AI context, research
 * artifacts, approvals — works on it from the moment it is created. Queries
 * live alongside the other client queries in `useDatabase`.
 */

export interface ProspectInput {
  /** Company name. The only required field on Day 0. */
  brand: string;
  decisionMaker?: string;
  decisionMakerRole?: string;
  decisionMakerEmail?: string;
  decisionMakerPhone?: string;
  /** auth.users id of whoever owns the relationship. */
  relationshipOwner?: string | null;
  /** Who knows the decision-maker, and how. */
  warmPath?: string;
  prospectSource?: string;
  website?: string;
  vertical?: string;
}

function invalidate(qc: ReturnType<typeof useQueryClient>, wsId?: string | null) {
  // Every clients query is keyed ["clients", wsId, <lifecycle>], so invalidating
  // the prefix refreshes the prospect list, the client list and the all view.
  qc.invalidateQueries({ queryKey: ["clients", wsId ?? undefined] });
}

export function useCreateProspect() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (input: ProspectInput) => {
      const wsId = currentWorkspace?.id;
      if (!wsId) throw new Error("Select a workspace first");
      const brand = input.brand.trim();
      if (!brand) throw new Error("A company name is required");

      const { data, error } = await (supabase as any)
        .from("clients")
        .insert({
          workspace_id: wsId,
          brand,
          // `name` is NOT NULL on clients and is used as the contact label
          // across the app; fall back to the company until a contact is known.
          name: input.decisionMaker?.trim() || brand,
          lifecycle: "prospect",
          status: "NEW",
          decision_maker: input.decisionMaker?.trim() || null,
          decision_maker_role: input.decisionMakerRole?.trim() || null,
          decision_maker_email: input.decisionMakerEmail?.trim() || null,
          decision_maker_phone: input.decisionMakerPhone?.trim() || null,
          relationship_owner: input.relationshipOwner || null,
          warm_path: input.warmPath?.trim() || null,
          prospect_source: input.prospectSource?.trim() || null,
          website: input.website?.trim() || null,
          vertical: input.vertical?.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: number };
    },
    onSuccess: () => invalidate(qc, currentWorkspace?.id),
  });
}

export function useUpdateProspect() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ProspectInput> & { id: number }) => {
      const wsId = currentWorkspace?.id;
      if (!wsId) throw new Error("Select a workspace first");
      const dbPatch: Record<string, unknown> = {};
      if (patch.brand !== undefined) dbPatch.brand = patch.brand.trim();
      if (patch.decisionMaker !== undefined) dbPatch.decision_maker = patch.decisionMaker.trim() || null;
      if (patch.decisionMakerRole !== undefined) dbPatch.decision_maker_role = patch.decisionMakerRole.trim() || null;
      if (patch.decisionMakerEmail !== undefined) dbPatch.decision_maker_email = patch.decisionMakerEmail.trim() || null;
      if (patch.decisionMakerPhone !== undefined) dbPatch.decision_maker_phone = patch.decisionMakerPhone.trim() || null;
      if (patch.relationshipOwner !== undefined) dbPatch.relationship_owner = patch.relationshipOwner || null;
      if (patch.warmPath !== undefined) dbPatch.warm_path = patch.warmPath.trim() || null;
      if (patch.prospectSource !== undefined) dbPatch.prospect_source = patch.prospectSource.trim() || null;
      if (patch.website !== undefined) dbPatch.website = patch.website.trim() || null;
      if (patch.vertical !== undefined) dbPatch.vertical = patch.vertical.trim() || null;

      const { error } = await (supabase as any)
        .from("clients")
        .update(dbPatch)
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, currentWorkspace?.id),
  });
}

/**
 * Closed won. The database trigger stamps `converted_at`; everything attached
 * during the sale stays attached, which is the whole point of modelling a
 * prospect as a client row rather than a separate object.
 */
export function useConvertProspect() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async (id: number) => {
      const wsId = currentWorkspace?.id;
      if (!wsId) throw new Error("Select a workspace first");
      const { error } = await (supabase as any)
        .from("clients")
        .update({ lifecycle: "client" })
        .eq("id", id)
        .eq("workspace_id", wsId)
        .eq("lifecycle", "prospect");
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, currentWorkspace?.id),
  });
}

/** Closed lost. Keeps the row and its history; the trigger stamps `lost_at`. */
export function useMarkProspectLost() {
  const qc = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const wsId = currentWorkspace?.id;
      if (!wsId) throw new Error("Select a workspace first");
      const { error } = await (supabase as any)
        .from("clients")
        .update({ lifecycle: "churned", lost_reason: reason?.trim() || null })
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, currentWorkspace?.id),
  });
}
