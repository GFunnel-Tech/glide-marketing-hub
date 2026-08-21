import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PHASES = [
  { num: 1, label: "1 — Access" },
  { num: 2, label: "2 — Tracking" },
  { num: 3, label: "3 — Strategy" },
  { num: 4, label: "4 — Launch" },
  { num: 5, label: "5 — Optimizing" },
  { num: 6, label: "6 — Testing" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function NewClientDialog({ open, onOpenChange }: Props) {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [brand, setBrand] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [owner, setOwner] = useState("");
  const [phase, setPhase] = useState("1");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setBrand(""); setContact(""); setWebsite(""); setOwner(""); setPhase("1");
  };

  const submit = async () => {
    const wsId = currentWorkspace?.id;
    if (!wsId) { toast.error("No workspace selected"); return; }
    if (!brand.trim()) { toast.error("Company / brand name is required"); return; }
    setSaving(true);
    try {
      const brandName = brand.trim();
      const contactName = contact.trim() || brandName;
      const { data: client, error } = await (supabase as any)
        .from("clients")
        .insert({
          workspace_id: wsId,
          brand: brandName,
          name: contactName,
          status: "NEW",
          website: website.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: obErr } = await (supabase as any).from("onboarding").insert({
        workspace_id: wsId,
        client_id: client.id,
        brand: brandName,
        name: contactName,
        phase: Number(phase),
        days_in_phase: 0,
        owner: owner.trim() || "Unassigned",
        blockers: [],
      });
      if (obErr) throw obErr;

      toast.success(`${brandName} added to onboarding`);
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Could not create client", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nc-brand">Company / brand *</Label>
            <Input id="nc-brand" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Lending with Nick" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-contact">Contact name</Label>
            <Input id="nc-contact" value={contact} onChange={e => setContact(e.target.value)} placeholder="Nick Johnson" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-website">Website</Label>
            <Input id="nc-website" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nc-owner">Owner</Label>
              <Input id="nc-owner" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Zak" />
            </div>
            <div className="space-y-1.5">
              <Label>Starting phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PHASES.map(p => (
                    <SelectItem key={p.num} value={String(p.num)}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating..." : "Create client"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
