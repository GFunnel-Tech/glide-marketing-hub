import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCreateClientRequest } from "@/hooks/useClientRequests";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export function RequestCampaignDialog({ clientId, trigger }: { clientId: number | null; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("new_campaign");
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  const [audience, setAudience] = useState("");
  const [notes, setNotes] = useState("");
  const create = useCreateClientRequest("campaign", clientId);

  async function submit() {
    if (!objective) { toast.error("Add a short objective"); return; }
    try {
      await create.mutateAsync({
        type, objective,
        budget: budget ? Number(budget) : null,
        target_audience: audience || null,
        creative_notes: notes || null,
      });
      toast.success("Request sent — your account manager was notified.");
      setOpen(false); setObjective(""); setBudget(""); setAudience(""); setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="w-full"><Sparkles className="h-4 w-4 mr-2" /> Request a Campaign</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request a Campaign</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="new_campaign">New Campaign</option>
              <option value="scale">Scale existing</option>
              <option value="creative_refresh">Creative refresh</option>
              <option value="new_offer">New offer</option>
            </select>
          </div>
          <div>
            <Label>Objective / goal</Label>
            <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Drive first-time home buyer leads under $35 CPL" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Budget (USD / month)</Label>
              <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="3000" />
            </div>
            <div>
              <Label>Target audience</Label>
              <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. FL homeowners 35+" />
            </div>
          </div>
          <div>
            <Label>Creative / notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Anything the team should know…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Send Request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
