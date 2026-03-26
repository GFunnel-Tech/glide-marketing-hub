import { useState, useMemo } from "react";
import { clients, Client } from "@/data/mockData";
import { StatusBadge } from "./StatusBadge";
import { ClientDrawer } from "./ClientDrawer";
import { cn } from "@/lib/utils";
import { ArrowUpDown, Building2, User, MoreHorizontal, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";

type StatusFilter = "ALL" | "GREEN" | "YELLOW" | "RED" | "BLOCKED";
type SortKey = keyof Client;
type SortDir = "asc" | "desc";

const statusOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2, BLOCKED: 3 };

function getCPLColor(cpl: number) {
  if (cpl < 30) return "text-success";
  if (cpl <= 60) return "text-warning";
  return "text-destructive";
}

function getCVRColor(cvr: number) {
  if (cvr > 15) return "text-success";
  if (cvr >= 10) return "text-warning";
  return "text-destructive";
}

function getFreqColor(f: number) {
  if (f > 4) return "text-destructive";
  if (f > 3) return "text-warning";
  return "text-foreground";
}

export function ClientTable() {
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    let list = clients;
    if (filter !== "ALL") list = list.filter((c) => c.status === filter);
    if (search) list = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.brand.toLowerCase().includes(search.toLowerCase()));
    return [...list].sort((a, b) => {
      if (sortKey === "status") {
        const diff = statusOrder[a.status] - statusOrder[b.status];
        return sortDir === "asc" ? diff : -diff;
      }
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }, [filter, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filters: StatusFilter[] = ["ALL", "GREEN", "YELLOW", "RED", "BLOCKED"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">All Clients</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary tabular-nums">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
          <div className="relative ml-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-8 w-48 pl-8 text-xs" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/50">
                {[
                  { key: "id" as SortKey, label: "#", w: "w-10" },
                  { key: "name" as SortKey, label: "Client", w: "w-48" },
                  { key: "status" as SortKey, label: "Status", w: "w-24" },
                  { key: "bmType" as SortKey, label: "BM Type", w: "w-28" },
                  { key: "cpl" as SortKey, label: "CPL", w: "w-20" },
                  { key: "cpm" as SortKey, label: "CPM", w: "w-20" },
                  { key: "leads" as SortKey, label: "Leads", w: "w-20" },
                  { key: "spend" as SortKey, label: "Spend", w: "w-24" },
                  { key: "formCvr" as SortKey, label: "Form CVR", w: "w-20" },
                  { key: "frequency" as SortKey, label: "Freq", w: "w-16" },
                  { key: "plaiConnected" as SortKey, label: "Plai", w: "w-14" },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={cn("px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none", col.w)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedClient(c)}
                  className={cn(
                    "border-b border-border cursor-pointer transition-colors hover:bg-accent/50",
                    c.status === "BLOCKED" && "opacity-60",
                    c.status === "GREEN" && "border-l-2 border-l-success",
                    c.status === "RED" && "border-l-2 border-l-destructive",
                    c.frequency > 3.5 && "animate-pulse-amber"
                  )}
                >
                  <td className="px-3 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.brand}</p>
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      {c.bmType === "Own BM" ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                      {c.bmType}
                    </span>
                  </td>
                  <td className={cn("px-3 py-3 font-semibold tabular-nums", getCPLColor(c.cpl))}>${c.cpl.toFixed(2)}</td>
                  <td className={cn("px-3 py-3 font-semibold tabular-nums", getCPLColor(c.cpm > 120 ? 61 : c.cpm > 80 ? 31 : 0))}>${c.cpm.toFixed(2)}</td>
                  <td className="px-3 py-3 tabular-nums text-foreground">{c.leads}</td>
                  <td className="px-3 py-3 tabular-nums text-foreground">${c.spend.toLocaleString()}</td>
                  <td className={cn("px-3 py-3 font-semibold tabular-nums", getCVRColor(c.formCvr))}>{c.formCvr}%</td>
                  <td className={cn("px-3 py-3 tabular-nums", getFreqColor(c.frequency))}>{c.frequency}</td>
                  <td className="px-3 py-3">
                    <Tooltip>
                      <TooltipTrigger>
                        <span className={cn("inline-block h-2.5 w-2.5 rounded-full", c.plaiConnected ? "bg-success" : "bg-destructive")} />
                      </TooltipTrigger>
                      <TooltipContent>{c.plaiConnected ? "Connected" : "Not connected — click to assign"}</TooltipContent>
                    </Tooltip>
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={(e) => { e.stopPropagation(); }} className="text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedClient && <ClientDrawer client={selectedClient} onClose={() => setSelectedClient(null)} />}
    </div>
  );
}
