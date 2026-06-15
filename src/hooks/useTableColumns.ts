import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

export type ColumnConfig =
  | { id: string; kind: "builtin"; hidden?: boolean }
  | { id: string; kind: "custom_kpi"; kpi_id: string }
  | {
      id: string;
      kind: "formula";
      label: string;
      expr: string; // e.g. "spend / leads * 1.2"
      format: "number" | "currency" | "percent";
      decimals?: number;
    };

export type Density = "compact" | "normal";

export interface TableView {
  columns: ColumnConfig[]; // ordered. Builtins listed here override default visibility.
  density: Density;
}

const QK = (wsId: string | null, userId: string | null, tableKey: string) =>
  ["user-table-view", wsId, userId, tableKey] as const;

export function useTableView(tableKey: string) {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const wsId = currentWorkspace?.id ?? null;
  const userId = user?.id ?? null;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: QK(wsId, userId, tableKey),
    enabled: !!wsId && !!userId,
    queryFn: async (): Promise<TableView> => {
      const { data, error } = await (supabase as any)
        .from("user_table_views")
        .select("columns, density")
        .eq("user_id", userId)
        .eq("workspace_id", wsId)
        .eq("table_key", tableKey)
        .maybeSingle();
      if (error) throw error;
      return {
        columns: Array.isArray(data?.columns) ? data!.columns : [],
        density: (data?.density as Density) ?? "normal",
      };
    },
  });

  const saveMut = useMutation({
    mutationFn: async (view: TableView) => {
      if (!wsId || !userId) throw new Error("Not signed in");
      const { error } = await (supabase as any)
        .from("user_table_views")
        .upsert(
          {
            user_id: userId,
            workspace_id: wsId,
            table_key: tableKey,
            columns: view.columns,
            density: view.density,
          },
          { onConflict: "user_id,workspace_id,table_key" }
        );
      if (error) throw error;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: QK(wsId, userId, tableKey) });
      const prev = qc.getQueryData<TableView>(QK(wsId, userId, tableKey));
      qc.setQueryData(QK(wsId, userId, tableKey), next);
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK(wsId, userId, tableKey), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK(wsId, userId, tableKey) }),
  });

  return {
    view: query.data ?? { columns: [], density: "normal" as Density },
    isLoading: query.isLoading,
    save: (v: TableView) => saveMut.mutate(v),
    isSaving: saveMut.isPending,
  };
}

/** Tiny safe arithmetic evaluator: numbers + + - * / ( ) and identifiers from `scope`. */
export function evalFormula(expr: string, scope: Record<string, number>): number | null {
  try {
    const cleaned = expr.replace(/\s+/g, "");
    if (!/^[a-zA-Z0-9_+\-*/().]+$/.test(cleaned)) return null;
    // Replace identifiers with numbers, undefined → 0
    const replaced = cleaned.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (k) => {
      const v = scope[k];
      return typeof v === "number" && Number.isFinite(v) ? String(v) : "0";
    });
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict";return (${replaced});`);
    const out = fn();
    return typeof out === "number" && Number.isFinite(out) ? out : null;
  } catch {
    return null;
  }
}

export function formatColumnValue(value: number | null, fmt: "number" | "currency" | "percent", decimals = 2): string {
  if (value == null) return "—";
  const body = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (fmt === "currency") return `$${body}`;
  if (fmt === "percent") return `${body}%`;
  return body;
}

/** Helper hook: reflects view.columns into a Set of hidden builtin ids. */
export function useHiddenSet(view: TableView): Set<string> {
  const [set, setSet] = useState<Set<string>>(() => {
    return new Set(view.columns.filter((c: any) => c.kind === "builtin" && c.hidden).map((c) => c.id));
  });
  useEffect(() => {
    setSet(new Set(view.columns.filter((c: any) => c.kind === "builtin" && c.hidden).map((c) => c.id)));
  }, [view]);
  return set;
}
