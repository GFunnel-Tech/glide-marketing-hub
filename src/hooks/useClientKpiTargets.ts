// Resolve the effective KPI targets for a single client, in a form the client
// portal can render as plain reference text (no colours, no status).
//
// Resolution order (later beats earlier):
//   1. Global default preset (kpi_threshold_presets where is_default = true)
//   2. Client's workspace preset (workspace_kpi_settings.preset_id)
//   3. Workspace-level overrides (workspace_kpi_settings.overrides)
//   4. Per-client overrides (client_kpi_overrides.overrides)
//
// The portal calls this via clientId only (no workspace context needed) — we
// derive the workspace from the client row.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ResolvedKpiTargets {
  cpl: number | null;         // green threshold (≤)
  cpm: number | null;         // green threshold (≤)
  leads: number | null;       // green threshold (≥)
  frequency: number | null;   // green threshold (≤)
  form_cvr: number | null;    // green threshold (≥) — percent (0–100)
}

interface KpiSpec {
  green?: number;
  yellow?: number;
  direction?: "lower" | "higher" | "band";
}
type KpiMap = Record<string, KpiSpec>;

function merge(base: KpiMap, over: KpiMap | null | undefined): KpiMap {
  if (!over) return base;
  const out: KpiMap = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = { ...(base[k] ?? {}), ...v };
  }
  return out;
}

export function useClientKpiTargets(clientId: number | null | undefined) {
  return useQuery({
    queryKey: ["portal-kpi-targets", clientId],
    enabled: clientId != null,
    queryFn: async (): Promise<ResolvedKpiTargets> => {
      // 1. Get client → workspace_id
      const { data: clientRow } = await supabase
        .from("clients")
        .select("workspace_id")
        .eq("id", clientId!)
        .maybeSingle();
      const workspaceId = clientRow?.workspace_id ?? null;

      // 2. Global default preset (fallback for everything below)
      const { data: defaultPreset } = await supabase
        .from("kpi_threshold_presets" as any)
        .select("kpis")
        .eq("is_default", true)
        .maybeSingle();
      let effective: KpiMap = ((defaultPreset as any)?.kpis ?? {}) as KpiMap;

      // 3. Workspace settings (preset + overrides)
      if (workspaceId) {
        const { data: ws } = await supabase
          .from("workspace_kpi_settings" as any)
          .select("preset_id, overrides")
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        const presetId = (ws as any)?.preset_id ?? null;
        if (presetId) {
          const { data: wsPreset } = await supabase
            .from("kpi_threshold_presets" as any)
            .select("kpis")
            .eq("id", presetId)
            .maybeSingle();
          effective = merge(effective, ((wsPreset as any)?.kpis ?? {}) as KpiMap);
        }
        effective = merge(effective, ((ws as any)?.overrides ?? {}) as KpiMap);
      }

      // 4. Client-level overrides
      const { data: co } = await supabase
        .from("client_kpi_overrides" as any)
        .select("overrides")
        .eq("client_id", clientId!)
        .maybeSingle();
      effective = merge(effective, ((co as any)?.overrides ?? {}) as KpiMap);

      const num = (k: string): number | null => {
        const v = effective[k]?.green;
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      };
      return {
        cpl: num("cpl"),
        cpm: num("cpm"),
        leads: num("leads"),
        frequency: num("frequency"),
        form_cvr: num("lead_quality"), // presets currently don't carry form_cvr — closest signal
      };
    },
  });
}
