import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClients";
import { Check, ChevronDown } from "lucide-react";

export function PortalClientSwitcher() {
  const { mappings, activeClientId, setActiveClientId } = usePortalClient();
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<Record<number, string>>({});

  useEffect(() => {
    (async () => {
      const ids = mappings.map((m) => m.client_id);
      if (!ids.length) return;
      const { data } = await supabase.from("clients").select("id, name").in("id", ids);
      const map: Record<number, string> = {};
      (data ?? []).forEach((c: any) => (map[c.id] = c.name));
      setNames(map);
    })();
  }, [mappings]);

  if (mappings.length <= 1) return null;

  const activeName = activeClientId ? names[activeClientId] ?? `Client #${activeClientId}` : "Select";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 text-sm text-white"
      >
        <span className="truncate">{activeName}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden">
            {mappings.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setActiveClientId(m.client_id);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
              >
                <div>
                  <div className="font-medium">{names[m.client_id] ?? `Client #${m.client_id}`}</div>
                  {m.status !== "active" && (
                    <div className="text-[10px] uppercase tracking-wide text-warning">{m.status.replace("_", " ")}</div>
                  )}
                </div>
                {m.client_id === activeClientId && <Check className="h-4 w-4 text-success" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
