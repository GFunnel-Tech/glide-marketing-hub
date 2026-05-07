import { useEffect, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface CreativeRules {
  greenCpl: number;
  redCpl: number;
  minLeadsBest: number;
  minSpendBest: number;
  minSpendWorst: number;
  learningMaxDays: number;
  learningMinLeads: number;
}

export const DEFAULT_RULES: CreativeRules = {
  greenCpl: 30,
  redCpl: 60,
  minLeadsBest: 5,
  minSpendBest: 50,
  minSpendWorst: 200,
  learningMaxDays: 7,
  learningMinLeads: 5,
};

const KEY = (wsId: string | null) => `creative_rules_${wsId ?? "default"}`;

export function useCreativeRules() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const [rules, setRulesState] = useState<CreativeRules>(DEFAULT_RULES);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY(wsId));
      if (raw) setRulesState({ ...DEFAULT_RULES, ...JSON.parse(raw) });
      else setRulesState(DEFAULT_RULES);
    } catch {
      setRulesState(DEFAULT_RULES);
    }
  }, [wsId]);

  const setRules = (next: CreativeRules) => {
    setRulesState(next);
    try { localStorage.setItem(KEY(wsId), JSON.stringify(next)); } catch {}
  };

  const reset = () => setRules(DEFAULT_RULES);

  return { rules, setRules, reset };
}
