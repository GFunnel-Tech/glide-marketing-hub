import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useUpsertRebillConfig, type RebillConfig, type RebillCadence } from "@/hooks/useRebilling";

interface Props {
  clientId: number;
  clientName: string;
  existing?: RebillConfig;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RebillConfigDialog({ clientId, clientName, existing, open, onOpenChange }: Props) {
  const upsert = useUpsertRebillConfig();
  const [enabled, setEnabled] = useState(true);
  const [markup, setMarkup] = useState("103");
  const [fee, setFee] = useState("0");
  const [min, setMin] = useState("0");
  const [cadence, setCadence] = useState<RebillCadence>("monthly");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (existing) {
      setEnabled(existing.enabled);
      setMarkup(String(existing.markup_pct));
      setFee(String(existing.fixed_fee));
      setMin(String(existing.monthly_minimum));
      setCadence(existing.cadence);
      setCurrency(existing.currency);
      setNotes(existing.notes ?? "");
    }
  }, [existing, open]);

  const save = async () => {
    await upsert.mutateAsync({
      client_id: clientId,
      enabled,
      markup_pct: Number(markup),
      fixed_fee: Number(fee),
      monthly_minimum: Number(min),
      cadence,
      currency,
      notes: notes || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rebill settings — {clientName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enabled</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Markup % <span className="text-muted-foreground text-xs">(100 = no markup)</span></Label>
              <Input type="number" step="0.1" value={markup} onChange={(e) => setMarkup(e.target.value)} />
            </div>
            <div>
              <Label>Fixed fee / period</Label>
              <Input type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div>
              <Label>Monthly minimum</Label>
              <Input type="number" step="0.01" value={min} onChange={(e) => setMin(e.target.value)} />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
            </div>
          </div>
          <div>
            <Label>Cadence</Label>
            <Select value={cadence} onValueChange={(v) => setCadence(v as RebillCadence)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={upsert.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
