import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, RotateCcw, AlertCircle, Sliders } from "lucide-react";
import { toast } from "sonner";

const ruleSchema = z.object({
  enabled: z.boolean(),
  max_cpl_absolute: z
    .union([z.number().positive("Must be > 0").max(10000, "Too high"), z.null()]),
  max_cpl_multiplier: z
    .number({ invalid_type_error: "Required" })
    .min(1.0, "Must be ≥ 1.0× the average")
    .max(10, "Max 10×"),
  min_ctr: z
    .number({ invalid_type_error: "Required" })
    .min(0, "Can't be negative")
    .max(100, "Max 100%"),
  max_frequency: z
    .number({ invalid_type_error: "Required" })
    .min(1.0, "Must be ≥ 1.0")
    .max(20, "Max 20"),
  min_spend_before_pause: z
    .number({ invalid_type_error: "Required" })
    .min(0, "Can't be negative")
    .max(100000, "Too high"),
  min_leads_threshold: z
    .number({ invalid_type_error: "Required" })
    .int("Whole number")
    .min(0, "Can't be negative")
    .max(1000, "Too high"),
});

type RuleForm = z.infer<typeof ruleSchema>;

const defaults: RuleForm = {
  enabled: true,
  max_cpl_absolute: null,
  max_cpl_multiplier: 1.5,
  min_ctr: 1.0,
  max_frequency: 3.5,
  min_spend_before_pause: 50,
  min_leads_threshold: 3,
};

export function OptimizationRulesPanel({
  clientId,
  workspaceId,
}: {
  clientId: number;
  workspaceId: string;
}) {
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["client-optimization-rules", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_optimization_rules" as any)
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState<RuleForm>(defaults);

  useEffect(() => {
    if (existing) {
      setForm({
        enabled: !!existing.enabled,
        max_cpl_absolute:
          existing.max_cpl_absolute != null ? Number(existing.max_cpl_absolute) : null,
        max_cpl_multiplier: Number(existing.max_cpl_multiplier ?? defaults.max_cpl_multiplier),
        min_ctr: Number(existing.min_ctr ?? defaults.min_ctr),
        max_frequency: Number(existing.max_frequency ?? defaults.max_frequency),
        min_spend_before_pause: Number(
          existing.min_spend_before_pause ?? defaults.min_spend_before_pause,
        ),
        min_leads_threshold: Number(
          existing.min_leads_threshold ?? defaults.min_leads_threshold,
        ),
      });
    } else {
      setForm(defaults);
    }
  }, [existing, clientId]);

  const validation = useMemo(() => ruleSchema.safeParse(form), [form]);
  const errors: Partial<Record<keyof RuleForm, string>> = useMemo(() => {
    if (validation.success) return {};
    const out: Partial<Record<keyof RuleForm, string>> = {};
    for (const issue of validation.error.issues) {
      const key = issue.path[0] as keyof RuleForm;
      if (key && !out[key]) out[key] = issue.message;
    }
    return out;
  }, [validation]);

  const isDirty = useMemo(() => {
    const base = existing
      ? {
          enabled: !!existing.enabled,
          max_cpl_absolute:
            existing.max_cpl_absolute != null ? Number(existing.max_cpl_absolute) : null,
          max_cpl_multiplier: Number(existing.max_cpl_multiplier),
          min_ctr: Number(existing.min_ctr),
          max_frequency: Number(existing.max_frequency),
          min_spend_before_pause: Number(existing.min_spend_before_pause),
          min_leads_threshold: Number(existing.min_leads_threshold),
        }
      : defaults;
    return JSON.stringify(base) !== JSON.stringify(form);
  }, [existing, form]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = ruleSchema.parse(form);
      const { error } = await supabase
        .from("client_optimization_rules" as any)
        .upsert(
          {
            client_id: clientId,
            workspace_id: workspaceId,
            ...parsed,
          },
          { onConflict: "client_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Optimization rules saved");
      qc.invalidateQueries({ queryKey: ["client-optimization-rules", clientId] });
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const update = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5" />
            Optimization Rules
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Thresholds the AI uses to flag underperformers.
          </p>
        </div>
        <Switch
          checked={form.enabled}
          onCheckedChange={(v) => update("enabled", v)}
          aria-label="Enable rules"
        />
      </div>

      <div
        className={`space-y-3 ${form.enabled ? "" : "opacity-50 pointer-events-none"}`}
      >
        <NumField
          label="Max CPL"
          suffix="$"
          help="Absolute ceiling. Leave blank to skip."
          value={form.max_cpl_absolute}
          onChange={(n) => update("max_cpl_absolute", n)}
          error={errors.max_cpl_absolute}
          allowNull
          step={1}
        />
        <NumField
          label="Max CPL multiplier"
          suffix="×"
          help="vs adset average (e.g. 1.5× = 50% over avg)"
          value={form.max_cpl_multiplier}
          onChange={(n) => update("max_cpl_multiplier", n ?? 0)}
          error={errors.max_cpl_multiplier}
          step={0.1}
        />
        <NumField
          label="Min CTR"
          suffix="%"
          help="Ads below this are paused"
          value={form.min_ctr}
          onChange={(n) => update("min_ctr", n ?? 0)}
          error={errors.min_ctr}
          step={0.1}
        />
        <NumField
          label="Max frequency"
          suffix=""
          help="Creative fatigue ceiling"
          value={form.max_frequency}
          onChange={(n) => update("max_frequency", n ?? 0)}
          error={errors.max_frequency}
          step={0.1}
        />
        <NumField
          label="Min spend before pause"
          suffix="$"
          help="Don't kill ads with little data"
          value={form.min_spend_before_pause}
          onChange={(n) => update("min_spend_before_pause", n ?? 0)}
          error={errors.min_spend_before_pause}
          step={5}
        />
        <NumField
          label="Min leads to judge"
          suffix=""
          help="Need at least this many leads of signal"
          value={form.min_leads_threshold}
          onChange={(n) => update("min_leads_threshold", n ?? 0)}
          error={errors.min_leads_threshold}
          step={1}
          integer
        />
      </div>

      {!validation.success && (
        <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-2.5 py-2 text-[11px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Fix the highlighted fields before saving.</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => save.mutate()}
          disabled={!validation.success || !isDirty || save.isPending}
          className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {save.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save rules
        </button>
        <button
          onClick={() => setForm(defaults)}
          disabled={save.isPending}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5"
          title="Reset to defaults"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
    </div>
  );
}

function NumField({
  label,
  suffix,
  help,
  value,
  onChange,
  error,
  step = 1,
  allowNull,
  integer,
}: {
  label: string;
  suffix: string;
  help?: string;
  value: number | null;
  onChange: (n: number | null) => void;
  error?: string;
  step?: number;
  allowNull?: boolean;
  integer?: boolean;
}) {
  const [text, setText] = useState<string>(value == null ? "" : String(value));

  useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);

  const handle = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") {
      onChange(allowNull ? null : NaN as any);
      return;
    }
    const n = integer ? parseInt(raw, 10) : parseFloat(raw);
    onChange(Number.isFinite(n) ? n : (NaN as any));
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-[11px] font-medium text-foreground">{label}</label>
        {help && <span className="text-[10px] text-muted-foreground">{help}</span>}
      </div>
      <div
        className={`flex items-center rounded-md border bg-background px-2 ${
          error ? "border-destructive" : "border-border focus-within:border-primary"
        }`}
      >
        {suffix === "$" && <span className="text-xs text-muted-foreground mr-1">$</span>}
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={text}
          onChange={(e) => handle(e.target.value)}
          placeholder={allowNull ? "—" : ""}
          className="flex-1 bg-transparent py-1.5 text-xs text-foreground focus:outline-none"
        />
        {suffix && suffix !== "$" && (
          <span className="text-xs text-muted-foreground ml-1">{suffix}</span>
        )}
      </div>
      {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
    </div>
  );
}
