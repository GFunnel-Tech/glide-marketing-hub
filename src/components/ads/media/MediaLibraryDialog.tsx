import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Search, Video, Check, RefreshCw, Wand2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useClientMediaLibrary, importLibraryAssets, type LibraryItem, type MediaSource } from "@/hooks/useClientMediaLibrary";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: number | null;
  remaining: number;
  onAdd: (assets: { url: string; name: string; type: "image" | "video" }[]) => void;
  onEditInStudio: (assets: { url: string; name: string; type: "image" | "video" }[]) => void;
}

const SOURCE_LABEL: Record<MediaSource, string> = {
  ghl: "Sub-account library",
  meta: "Meta ad account",
  metahub: "Glide Media uploads",
};

export function MediaLibraryDialog({ open, onOpenChange, clientId, remaining, onAdd, onEditInStudio }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [tab, setTab] = useState<MediaSource>("ghl");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, LibraryItem>>({});
  const [working, setWorking] = useState(false);

  const { data, isLoading, refetch, isFetching, error } = useClientMediaLibrary(currentWorkspace?.id, clientId, open);

  const items = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.items ?? []).filter((i) => i.source === tab && (!needle || i.name.toLowerCase().includes(needle)));
  }, [data?.items, tab, search]);

  const sourceError = data?.errors?.find((e) => e.source === tab)?.message;
  const selectedList = Object.values(selected);

  const toggle = (item: LibraryItem) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = item;
      return next;
    });

  const importSelection = async () => {
    if (!currentWorkspace || !selectedList.length) return [];
    const { imported, failures } = await importLibraryAssets(
      currentWorkspace.id,
      selectedList.map((i) => ({ url: i.url, name: i.name, type: i.type })),
    );
    if (failures.length) toast.warning(`${failures.length} file(s) could not be imported.`);
    return imported;
  };

  const handleUse = async () => {
    setWorking(true);
    try {
      const imported = await importSelection();
      if (imported.length) {
        onAdd(imported.slice(0, remaining));
        setSelected({});
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setWorking(false);
    }
  };

  const handleStudio = async () => {
    setWorking(true);
    try {
      const imported = await importSelection();
      if (imported.length) {
        onEditInStudio(imported);
        setSelected({});
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
          <DialogDescription>
            Pull creative straight from the client's GHL sub-account, their Meta ad account, or Glide Media uploads.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search media" className="h-9 pl-8 text-sm" />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as MediaSource)}>
          <TabsList className="grid grid-cols-3">
            {(Object.keys(SOURCE_LABEL) as MediaSource[]).map((s) => (
              <TabsTrigger key={s} value={s} className="text-xs">{SOURCE_LABEL[s]}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={tab} className="mt-3">
            {!clientId && tab !== "metahub" && (
              <Alert className="mb-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">Select a client account first to browse their {SOURCE_LABEL[tab].toLowerCase()}.</AlertDescription>
              </Alert>
            )}
            {sourceError && (
              <Alert variant="destructive" className="mb-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">{sourceError}</AlertDescription>
              </Alert>
            )}
            {error && <p className="text-xs text-destructive mb-2">{(error as Error).message}</p>}

            <ScrollArea className="h-[46vh] rounded-lg border border-border p-3">
              {isLoading ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : items.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">No media found in this source.</div>
              ) : (
                <div className="grid grid-cols-5 gap-2">
                  {items.map((item) => {
                    const isSel = Boolean(selected[item.id]);
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggle(item)}
                        className={cn(
                          "relative aspect-square rounded-lg overflow-hidden border-2 bg-muted group",
                          isSel ? "border-primary" : "border-transparent hover:border-border",
                        )}
                      >
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Video className="h-5 w-5 text-muted-foreground" /></div>
                        )}
                        {item.type === "video" && (
                          <Badge variant="secondary" className="absolute bottom-1 left-1 text-[9px] px-1 py-0">Video</Badge>
                        )}
                        {isSel && (
                          <div className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-background/80 text-[9px] truncate px-1 py-0.5 opacity-0 group-hover:opacity-100">{item.name}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">{selectedList.length} selected · {remaining} slot(s) left</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleStudio} disabled={!selectedList.length || working}>
              {working ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
              Edit in Studio
            </Button>
            <Button size="sm" onClick={handleUse} disabled={!selectedList.length || working || remaining <= 0}>
              {working ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Use in ad
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
