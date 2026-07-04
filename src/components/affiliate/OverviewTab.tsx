import { useMemo } from "react";
import { Users, Clock, CheckCircle2, Wallet, TrendingUp, type LucideIcon } from "lucide-react";
import {
  useAffiliateSummary, useCommissions, usePartners, useReferrals,
} from "@/hooks/useAffiliates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, EmptyState, fmtMoney, fmtDate } from "./shared";

function Stat({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Icon className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function OverviewTab({ onGoToTab }: { onGoToTab: (tab: string) => void }) {
  const summary = useAffiliateSummary();
  const { commissions } = useCommissions();
  const { partners, isLoading } = usePartners();
  const { referrals } = useReferrals();

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const recent = commissions.slice(0, 8);

  // Single currency across the book is the common case; fall back to USD.
  const currency = commissions[0]?.currency ?? "USD";

  const empty = !isLoading && partners.length === 0 && referrals.length === 0 && commissions.length === 0;

  if (empty) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="Set up your affiliate program"
          hint="Add partners and log referrals & commissions here — or connect Partnero (and other networks) under API & Integrations to sync everything in automatically."
        />
        <div className="flex justify-center gap-3">
          <button onClick={() => onGoToTab("partners")} className="text-sm text-primary underline underline-offset-4">
            Add your first partner
          </button>
          <button onClick={() => onGoToTab("api")} className="text-sm text-primary underline underline-offset-4">
            Connect an integration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat icon={Users} label="Active partners" value={String(summary.activePartners)} sub={`${summary.totalPartners} total`} />
        <Stat icon={TrendingUp} label="Referrals" value={String(summary.totalReferrals)} sub={`${summary.conversionRate}% converted`} />
        <Stat icon={Clock} label="Pending" value={fmtMoney(summary.pendingAmount, currency)} sub="awaiting approval" />
        <Stat icon={CheckCircle2} label="Approved" value={fmtMoney(summary.approvedAmount, currency)} sub="ready to pay out" />
        <Stat icon={Wallet} label="Paid out" value={fmtMoney(summary.paidAmount, currency)} sub={`${summary.openPayouts} open payout${summary.openPayouts === 1 ? "" : "s"}`} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent commissions</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No commissions yet.</p>
          ) : (
            <div className="divide-y">
              {recent.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{partnerById.get(c.partner_id)?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.description ?? fmtDate(c.occurred_on)}</div>
                  </div>
                  <StatusBadge status={c.status} />
                  <span className="text-sm font-semibold w-24 text-right">{fmtMoney(c.amount, c.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
