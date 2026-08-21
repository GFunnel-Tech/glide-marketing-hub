import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CTA_OPTIONS } from "@/components/ads/builder/types";
import { ArrowRight, Layers, Megaphone, RefreshCw, Trash2 } from "lucide-react";
import type { CampaignPlan } from "./planTypes";

interface Props {
  plan: CampaignPlan;
  onChange: (plan: CampaignPlan) => void;
  onRestart: () => void;
  onApprove: () => void;
}

export function PlanApproval({ plan, onChange, onRestart, onApprove }: Props) {
  const [open, setOpen] = useState<string[]>(["set-0"]);

  const patchSet = (i: number, partial: any) => {
    const adSets = plan.adSets.map((s, idx) => (idx === i ? { ...s, ...partial } : s));
    onChange({ ...plan, adSets });
  };
  const patchAd = (si: number, ai: number, partial: any) => {
    const adSets = plan.adSets.map((s, idx) =>
      idx !== si ? s : { ...s, ads: s.ads.map((a, j) => (j === ai ? { ...a, ...partial } : a)) },
    );
    onChange({ ...plan, adSets });
  };
  const removeAd = (si: number, ai: number) => {
    const adSets = plan.adSets.map((s, idx) => (idx !== si ? s : { ...s, ads: s.ads.filter((_, j) => j !== ai) }));
    onChange({ ...plan, adSets: adSets.filter((s) => s.ads.length > 0) });
  };
  const removeSet = (si: number) => onChange({ ...plan, adSets: plan.adSets.filter((_, i) => i !== si) });

  const totalAds = plan.adSets.reduce((n, s) => n + s.ads.length, 0);
  const totalBudget = plan.adSets.reduce((n, s) => n + (s.budgetAmount || 0), 0);

  return (
    <div className="space-y-5">
      <Card className="p-4 rounded-xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label className="text-xs">Campaign name</Label>
            <Input value={plan.campaignName} onChange={(e) => onChange({ ...plan, campaignName: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-6">
            <Badge variant="secondary" className="gap-1"><Layers className="h-3 w-3" />{plan.adSets.length} ad sets</Badge>
            <Badge variant="secondary" className="gap-1"><Megaphone className="h-3 w-3" />{totalAds} ads</Badge>
            <Badge variant="secondary">${totalBudget}/day</Badge>
          </div>
        </div>
        {plan.strategy && <p className="text-xs text-muted-foreground mt-3">{plan.strategy}</p>}
      </Card>

      <Accordion type="multiple" value={open} onValueChange={setOpen} className="space-y-3">
        {plan.adSets.map((set, si) => (
          <AccordionItem key={si} value={`set-${si}`} className="border border-border rounded-xl px-4 bg-card">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex-1 text-left">
                <div className="text-sm font-semibold text-foreground">{set.name}</div>
                <div className="text-xs text-muted-foreground">{set.ads.length} ads · ${set.budgetAmount}/day · ages {set.ageMin}-{set.ageMax}</div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-4">
              {set.rationale && <p className="text-xs text-muted-foreground italic">{set.rationale}</p>}

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Ad set name</Label>
                  <Input value={set.name} onChange={(e) => patchSet(si, { name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Daily budget</Label>
                  <Input type="number" min={1} value={set.budgetAmount} onChange={(e) => patchSet(si, { budgetAmount: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Gender</Label>
                  <Select value={set.genders} onValueChange={(v) => patchSet(si, { genders: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="male">Men</SelectItem>
                      <SelectItem value="female">Women</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Age min</Label>
                  <Input type="number" min={18} max={65} value={set.ageMin} onChange={(e) => patchSet(si, { ageMin: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Age max</Label>
                  <Input type="number" min={18} max={65} value={set.ageMax} onChange={(e) => patchSet(si, { ageMax: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Interests (comma separated)</Label>
                  <Input
                    value={set.interests.join(", ")}
                    onChange={(e) => patchSet(si, { interests: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    placeholder="Broad targeting"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {set.ads.map((ad, ai) => (
                  <div key={ai} className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Input value={ad.name} onChange={(e) => patchAd(si, ai, { name: e.target.value })} className="h-8 text-sm font-medium" />
                      <Select value={ad.cta} onValueChange={(v) => patchAd(si, ai, { cta: v })}>
                        <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{CTA_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <button onClick={() => removeAd(si, ai)} className="text-muted-foreground hover:text-destructive p-1" title="Remove ad">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex gap-3">
                      {ad.imageUrl && (
                        <img src={ad.imageUrl} alt={`${ad.name} creative`} className="w-24 h-24 rounded-lg object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 space-y-2 min-w-0">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Primary text variants</Label>
                          {ad.primaryTexts.map((t, k) => (
                            <Textarea
                              key={k}
                              value={t}
                              rows={2}
                              className="text-xs"
                              onChange={(e) => {
                                const next = [...ad.primaryTexts]; next[k] = e.target.value;
                                patchAd(si, ai, { primaryTexts: next });
                              }}
                            />
                          ))}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">Headlines</Label>
                          {ad.headlines.map((h, k) => (
                            <Input
                              key={k}
                              value={h}
                              className="h-8 text-xs"
                              onChange={(e) => {
                                const next = [...ad.headlines]; next[k] = e.target.value;
                                patchAd(si, ai, { headlines: next });
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeSet(si)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove ad set
              </Button>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="flex items-center gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3">
        <Button variant="outline" onClick={onRestart}><RefreshCw className="h-4 w-4 mr-2" /> Regenerate</Button>
        <Button className="flex-1 h-11" onClick={onApprove} disabled={!plan.adSets.length}>
          Approve &amp; open in builder <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
