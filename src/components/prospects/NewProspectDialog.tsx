import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateProspect } from "@/hooks/useProspectActions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Day 0 of the D3 playbook: the target account list. Company, decision-maker,
 * relationship owner and the warmest path to an introduction.
 */
export default function NewProspectDialog({ open, onOpenChange }: Props) {
  const create = useCreateProspect();
  const [brand, setBrand] = useState("");
  const [decisionMaker, setDecisionMaker] = useState("");
  const [decisionMakerRole, setDecisionMakerRole] = useState("");
  const [decisionMakerEmail, setDecisionMakerEmail] = useState("");
  const [warmPath, setWarmPath] = useState("");
  const [prospectSource, setProspectSource] = useState("");
  const [website, setWebsite] = useState("");

  const reset = () => {
    setBrand(""); setDecisionMaker(""); setDecisionMakerRole("");
    setDecisionMakerEmail(""); setWarmPath(""); setProspectSource(""); setWebsite("");
  };

  const submit = async () => {
    if (!brand.trim()) { toast.error("A company name is required"); return; }
    try {
      await create.mutateAsync({
        brand, decisionMaker, decisionMakerRole, decisionMakerEmail,
        warmPath, prospectSource, website,
      });
      toast.success(`${brand.trim()} added to the pipeline`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not add the prospect");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New prospect</DialogTitle>
          <DialogDescription>
            Start with the company. Everything else can be filled in as the relationship develops.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="p-brand">Company *</Label>
            <Input
              id="p-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Northwind Heating &amp; Air"
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="p-dm">Decision-maker</Label>
              <Input
                id="p-dm"
                value={decisionMaker}
                onChange={(e) => setDecisionMaker(e.target.value)}
                placeholder="Who signs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-role">Their role</Label>
              <Input
                id="p-role"
                value={decisionMakerRole}
                onChange={(e) => setDecisionMakerRole(e.target.value)}
                placeholder="Owner, CMO…"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="p-email">Their email</Label>
              <Input
                id="p-email"
                type="email"
                value={decisionMakerEmail}
                onChange={(e) => setDecisionMakerEmail(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-site">Website</Label>
              <Input
                id="p-site"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="p-warm">Warmest path to an introduction</Label>
            <Textarea
              id="p-warm"
              value={warmPath}
              onChange={(e) => setWarmPath(e.target.value)}
              rows={2}
              placeholder="Who already knows them, and how well"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="p-source">Source</Label>
            <Input
              id="p-source"
              value={prospectSource}
              onChange={(e) => setProspectSource(e.target.value)}
              placeholder="Referral, existing relationship, inbound…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add prospect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
