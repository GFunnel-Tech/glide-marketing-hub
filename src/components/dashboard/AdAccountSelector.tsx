import { useAdAccount } from "@/contexts/AdAccountContext";
import { ChevronDown, Megaphone } from "lucide-react";
import { useState } from "react";

/**
 * Ad Account selector. When `override` is true, the picker holds its own value
 * (per-section override) and exposes onChange. Otherwise it reads/writes the
 * global AdAccountContext.
 */
export function AdAccountSelector({
  value,
  onChange,
  className,
}: {
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
}) {
  const { selected, setSelected, accounts, isLoading } = useAdAccount();
  const isControlled = value !== undefined && onChange !== undefined;
  const v = isControlled ? value! : selected;
  const set = isControlled ? onChange! : setSelected;
  const [open, setOpen] = useState(false);

  const current = v === "all" ? "All ad accounts" : (accounts.find((a) => a.id === v)?.name ?? v);

  return (
    <div className={"relative " + (className ?? "")}>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground hover:bg-accent transition-colors"
      >
        <Megaphone className="h-3.5 w-3.5 text-primary" />
        <span className="text-muted-foreground text-xs">Ad Account:</span>
        <span className="font-medium truncate max-w-[180px]">{current}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-40 w-64 max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg p-1">
            <button
              onClick={() => { set("all"); setOpen(false); }}
              className={"w-full text-left px-3 py-2 rounded text-sm hover:bg-accent " + (v === "all" ? "bg-accent font-medium" : "")}
            >
              All ad accounts
            </button>
            {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>}
            {!isLoading && accounts.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No Meta ad accounts connected.</div>
            )}
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => { set(a.id); setOpen(false); }}
                className={"w-full text-left px-3 py-2 rounded text-sm hover:bg-accent " + (v === a.id ? "bg-accent font-medium" : "")}
              >
                <div className="truncate">{a.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{a.id}{a.currency ? ` · ${a.currency}` : ""}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
