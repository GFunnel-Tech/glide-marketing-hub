import { useState } from "react";
import { MoreHorizontal, Copy, Pause, Play, Pencil, TrendingUp, Loader2, ExternalLink } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getAdapter, type AdChannel } from "@/lib/adChannels";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface AdLike {
  id: string;
  name?: string | null;
  adset_id?: string | null;
  effective_status?: string | null;
  title?: string | null;
  body?: string | null;
  call_to_action_type?: string | null;
  link_url?: string | null;
}

export function AdActionsMenu({ ad, channel }: { ad: AdLike; channel: AdChannel }) {
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const adapter = getAdapter(channel);
  const wsId = currentWorkspace?.id;
  const isPaused = ad.effective_status === "PAUSED";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["meta_ads"] });
    qc.invalidateQueries({ queryKey: ["ad_action_log"] });
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (!wsId) return;
    setBusy(label);
    try {
      await fn();
      toast.success(`${label} succeeded`);
      refresh();
    } catch (e: any) {
      toast.error(`${label} failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const togglePause = () =>
    run(isPaused ? "Resume" : "Pause", () =>
      adapter.setStatus({ workspaceId: wsId!, adIds: [ad.id], status: isPaused ? "ACTIVE" : "PAUSED" }),
    );

  const scaleQuick = () =>
    ad.adset_id &&
    run("Scale +20%", () => adapter.updateBudget({ workspaceId: wsId!, adsetId: ad.adset_id!, percent: 20 }));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent text-muted-foreground"
            disabled={!adapter.supports.duplicate || !wsId}
            aria-label="Ad actions"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setDupOpen(true)} disabled={!adapter.supports.duplicate}>
            <Copy className="h-4 w-4 mr-2" /> Duplicate ad
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)} disabled={!adapter.supports.updateCreative}>
            <Pencil className="h-4 w-4 mr-2" /> Edit copy
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={scaleQuick} disabled={!adapter.supports.updateBudget || !ad.adset_id}>
            <TrendingUp className="h-4 w-4 mr-2" /> Scale +20%
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setBudgetOpen(true)} disabled={!adapter.supports.updateBudget || !ad.adset_id}>
            <TrendingUp className="h-4 w-4 mr-2" /> Set budget…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={togglePause} disabled={!adapter.supports.setStatus}>
            {isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
            {isPaused ? "Resume" : "Pause"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DuplicateDialog open={dupOpen} onOpenChange={setDupOpen} ad={ad} channel={channel} onDone={refresh} />
      <EditCopyDialog open={editOpen} onOpenChange={setEditOpen} ad={ad} channel={channel} onDone={refresh} />
      <BudgetDialog open={budgetOpen} onOpenChange={setBudgetOpen} ad={ad} channel={channel} onDone={refresh} />
    </>
  );
}

function DuplicateDialog({ open, onOpenChange, ad, channel, onDone }: any) {
  const { currentWorkspace } = useWorkspace();
  const [name, setName] = useState("Copy");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!currentWorkspace?.id) return;
    setBusy(true);
    try {
      const r = await getAdapter(channel).duplicateAd({
        workspaceId: currentWorkspace.id,
        adId: ad.id,
        newName: name || undefined,
        status: active ? "ACTIVE" : "PAUSED",
      });
      toast.success(`Duplicated → ${r.newAdId}`);
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate ad</DialogTitle>
          <DialogDescription>Creates a copy in the same ad set on Meta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name suffix</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Copy" />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Set status to ACTIVE (otherwise PAUSED)
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-3 w-3 mr-2 animate-spin" />} Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCopyDialog({ open, onOpenChange, ad, channel, onDone }: any) {
  const { currentWorkspace } = useWorkspace();
  const [title, setTitle] = useState(ad.title ?? "");
  const [body, setBody] = useState(ad.body ?? "");
  const [cta, setCta] = useState(ad.call_to_action_type ?? "");
  const [linkUrl, setLinkUrl] = useState(ad.link_url ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!currentWorkspace?.id) return;
    setBusy(true);
    try {
      await getAdapter(channel).updateCreative({
        workspaceId: currentWorkspace.id, adId: ad.id,
        title: title || undefined, body: body || undefined,
        callToActionType: cta || undefined, linkUrl: linkUrl || undefined,
      });
      toast.success("Ad copy updated");
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit ad copy</DialogTitle>
          <DialogDescription>Creates a new creative with these edits and swaps it in.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Headline</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Primary text</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CTA</Label>
              <select value={cta} onChange={(e) => setCta(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Keep current</option>
                {["LEARN_MORE","SIGN_UP","CONTACT_US","GET_QUOTE","BOOK_TRAVEL","APPLY_NOW","DOWNLOAD","SUBSCRIBE","SHOP_NOW","GET_OFFER","MESSAGE_PAGE"].map(c => <option key={c} value={c}>{c.replace(/_/g," ")}</option>)}
              </select>
            </div>
            <div><Label>Link URL</Label><Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-3 w-3 mr-2 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BudgetDialog({ open, onOpenChange, ad, channel, onDone }: any) {
  const { currentWorkspace } = useWorkspace();
  const [mode, setMode] = useState<"percent" | "daily">("percent");
  const [percent, setPercent] = useState("20");
  const [daily, setDaily] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!currentWorkspace?.id || !ad.adset_id) return;
    setBusy(true);
    try {
      await getAdapter(channel).updateBudget({
        workspaceId: currentWorkspace.id,
        adsetId: ad.adset_id,
        percent: mode === "percent" ? Number(percent) : undefined,
        dailyBudget: mode === "daily" ? Number(daily) : undefined,
      });
      toast.success("Budget updated");
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust ad-set budget</DialogTitle>
          <DialogDescription>Applies to the parent ad set on Meta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant={mode === "percent" ? "default" : "outline"} size="sm" onClick={() => setMode("percent")}>Percent</Button>
            <Button variant={mode === "daily" ? "default" : "outline"} size="sm" onClick={() => setMode("daily")}>Set daily</Button>
          </div>
          {mode === "percent" ? (
            <div><Label>Change by %</Label><Input type="number" value={percent} onChange={(e) => setPercent(e.target.value)} /></div>
          ) : (
            <div><Label>New daily budget (account currency)</Label><Input type="number" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="50.00" /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-3 w-3 mr-2 animate-spin" />} Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
