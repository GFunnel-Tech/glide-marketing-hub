import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

interface PickerClient {
  id: number;
  name: string;
  brand?: string;
  status?: any;
  cpl?: number;
}

interface ClientPickerProps {
  clients: PickerClient[];
  value: number | null;
  onChange: (id: number | null) => void;
  isLoading?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * Searchable client selector backed by the full workspace client list.
 * Replaces the old native <select> so every synced client is reachable and
 * filterable by name or brand.
 */
export function ClientPicker({
  clients,
  value,
  onChange,
  isLoading,
  className,
  placeholder = "Select client…",
}: ClientPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs",
            "hover:bg-accent transition-colors min-w-[200px]",
            className,
          )}
        >
          <span className="truncate text-left">
            {isLoading
              ? "Loading clients…"
              : selected
                ? selected.brand
                  ? `${selected.name} — ${selected.brand}`
                  : selected.name
                : placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="end">
        <Command
          filter={(val, search) => (val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search clients…" className="text-xs" />
          <CommandList>
            <CommandEmpty>
              {clients.length === 0 ? "No clients synced yet." : "No match."}
            </CommandEmpty>
            <CommandGroup heading={`${clients.length} client${clients.length === 1 ? "" : "s"}`}>
              {value != null && (
                <CommandItem
                  value="__clear__ clear selection"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-xs text-muted-foreground"
                >
                  Clear selection
                </CommandItem>
              )}
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.brand ?? ""}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className="text-xs gap-2"
                >
                  <Check className={cn("h-3.5 w-3.5", value === c.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-foreground">{c.name}</p>
                    {c.brand && <p className="truncate text-[11px] text-muted-foreground">{c.brand}</p>}
                  </div>
                  {c.status && <StatusBadge status={c.status} />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
