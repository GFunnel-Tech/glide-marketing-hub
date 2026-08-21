import { useAdDraftStore } from "@/stores/adDraftStore";
import { ChevronDown, ChevronRight, LayoutGrid, Plus, MoreHorizontal, Pencil, Trash2, Copy, Megaphone } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export function AdSetSidebar() {
  const state = useAdDraftStore((s) => s.state);
  const addAdSet = useAdDraftStore((s) => s.addAdSet);
  const addAd = useAdDraftStore((s) => s.addAd);
  const selectAd = useAdDraftStore((s) => s.selectAd);
  const renameAdSet = useAdDraftStore((s) => s.renameAdSet);
  const renameAd = useAdDraftStore((s) => s.renameAd);
  const deleteAdSet = useAdDraftStore((s) => s.deleteAdSet);
  const deleteAd = useAdDraftStore((s) => s.deleteAd);
  const selectCampaign = useAdDraftStore((s) => s.selectCampaign);
  const addCampaign = useAdDraftStore((s) => s.addCampaign);
  const duplicateCampaign = useAdDraftStore((s) => s.duplicateCampaign);
  const renameCampaign = useAdDraftStore((s) => s.renameCampaign);
  const deleteCampaign = useAdDraftStore((s) => s.deleteCampaign);
  const duplicateAdSet = useAdDraftStore((s) => s.duplicateAdSet);
  const duplicateAd = useAdDraftStore((s) => s.duplicateAd);
  const campaigns = state.campaigns ?? [];

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(state.adSets.map((s) => [s.id, true])),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const beginEdit = (id: string, current: string) => {
    setEditing(id); setEditValue(current);
  };
  const commitEdit = (cb: (v: string) => void) => {
    if (editValue.trim()) cb(editValue.trim());
    setEditing(null);
  };

  return (
    <aside className="w-[260px] flex-shrink-0 border-r border-border bg-muted/30 h-full overflow-y-auto p-2">
      <div className="mb-2 px-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Campaigns ({campaigns.length})
          </span>
          <button
            onClick={addCampaign}
            className="text-muted-foreground hover:text-foreground p-0.5"
            title="Add campaign"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1">
          {campaigns.map((c) => {
            const active = c.id === state.selectedCampaignId;
            const adCount = c.adSets.reduce((n, x) => n + x.ads.length, 0);
            return (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md border group cursor-pointer",
                  active ? "bg-card border-primary/40 shadow-sm" : "bg-card/50 border-border hover:bg-accent/40",
                )}
                onClick={() => !active && selectCampaign(c.id)}
              >
                <Megaphone className={cn("h-3.5 w-3.5 flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                {editing === c.id ? (
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEdit((v) => renameCampaign(c.id, v))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit((v) => renameCampaign(c.id, v));
                      if (e.key === "Escape") setEditing(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-6 text-xs"
                  />
                ) : (
                  <div className="min-w-0 flex-1" onDoubleClick={(e) => { e.stopPropagation(); beginEdit(c.id, c.name); }}>
                    <div className="text-xs font-medium text-foreground truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {c.adSets.length} ad set{c.adSets.length === 1 ? "" : "s"} · {adCount} ad{adCount === 1 ? "" : "s"} · {c.objective}
                    </div>
                  </div>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => beginEdit(c.id, c.name)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateCampaign(c.id)}>
                      <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate campaign
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => deleteCampaign(c.id)}
                      disabled={campaigns.length <= 1}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={addAdSet}
        className="w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-md px-2 py-2 text-xs font-semibold hover:bg-primary/90 mb-2"
      >
        <Plus className="h-3.5 w-3.5" /> New ad set
      </button>

      <div className="space-y-1">
        {state.adSets.map((set) => {
          const isSelectedSet = set.id === state.selectedAdSetId;
          const open = expanded[set.id] ?? true;
          return (
            <div key={set.id} className="rounded-md">
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 py-1.5 rounded-md group",
                  isSelectedSet ? "bg-primary/5" : "hover:bg-accent/40",
                )}
              >
                <button onClick={() => toggle(set.id)} className="text-muted-foreground hover:text-foreground">
                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                {editing === set.id ? (
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitEdit((v) => renameAdSet(set.id, v))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit((v) => renameAdSet(set.id, v));
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="h-6 text-xs"
                  />
                ) : (
                  <button
                    onClick={() => { selectAd(set.id, set.ads[0]?.id ?? ""); }}
                    onDoubleClick={() => beginEdit(set.id, set.name)}
                    className="flex-1 text-left text-xs font-medium text-foreground truncate"
                  >
                    {set.name}
                  </button>
                )}
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => beginEdit(set.id, set.name)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => addAd(set.id)}>
                      <Plus className="h-3.5 w-3.5 mr-2" /> Add ad
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateAdSet(set.id)}>
                      <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate ad set
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => deleteAdSet(set.id)}
                      disabled={state.adSets.length <= 1}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {open && (
                <div className="ml-5 pl-2 border-l border-border space-y-0.5 mt-0.5">
                  {set.ads.map((ad) => {
                    const isSelectedAd = ad.id === state.selectedAdId && isSelectedSet;
                    return (
                      <div
                        key={ad.id}
                        className={cn(
                          "flex items-center gap-1.5 px-1.5 py-1 rounded-md group cursor-pointer",
                          isSelectedAd ? "bg-primary/10 text-primary" : "hover:bg-accent/40 text-foreground",
                        )}
                        onClick={() => selectAd(set.id, ad.id)}
                      >
                        <div className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                        {editing === ad.id ? (
                          <Input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit((v) => renameAd(set.id, ad.id, v))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit((v) => renameAd(set.id, ad.id, v));
                              if (e.key === "Escape") setEditing(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-6 text-xs"
                          />
                        ) : (
                          <span
                            className="flex-1 text-xs truncate"
                            onDoubleClick={(e) => { e.stopPropagation(); beginEdit(ad.id, ad.name); }}
                          >
                            {ad.name}
                          </span>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5"
                            >
                              <MoreHorizontal className="h-3 w-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => beginEdit(ad.id, ad.name)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicateAd(set.id, ad.id)}>
                              <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate ad
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteAd(set.id, ad.id)}
                              disabled={set.ads.length <= 1}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => addAd(set.id)}
                    className="w-full flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-1 rounded-md hover:bg-accent/40"
                  >
                    <Plus className="h-3 w-3" /> Add ad
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
