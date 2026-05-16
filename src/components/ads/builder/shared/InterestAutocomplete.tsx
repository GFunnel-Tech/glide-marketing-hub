import { useState } from "react";
import { Search, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { InterestTarget } from "../types";

interface Props {
  value: InterestTarget[];
  onChange: (next: InterestTarget[]) => void;
}

export function InterestAutocomplete({ value, onChange }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<InterestTarget[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (term: string) => {
    setQ(term);
    if (!term.trim() || !currentWorkspace) { setResults([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-targeting-search", {
        body: { workspaceId: currentWorkspace.id, query: term },
      });
      if (error) throw error;
      setResults((data?.results ?? []) as InterestTarget[]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const add = (i: InterestTarget) => {
    if (value.find((v) => v.id === i.id)) return;
    onChange([...value, i]);
    setQ(""); setResults([]);
  };
  const remove = (id: string) => onChange(value.filter((v) => v.id !== id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((i) => (
          <span key={i.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-md px-2 py-1 text-xs">
            {i.name}
            <button onClick={() => remove(i.id)}><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => search(e.target.value)} placeholder="Search interests (e.g. real estate)…" className="pl-8 h-9" />
        {(results.length > 0 || loading) && (
          <div className="absolute z-10 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {loading && <div className="p-3 text-xs text-muted-foreground">Searching…</div>}
            {results.map((r) => (
              <button key={r.id} onClick={() => add(r)} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent text-left">
                <span>{r.name}</span>
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
