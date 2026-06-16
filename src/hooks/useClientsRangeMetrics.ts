import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useDateRange } from "@/hooks/useDateRange";

export interface ClientRangeMetrics {
  clientId: number;
  spend: number;
  impressions: number;
  clicks: number;
  reportedLeads: number;
  trueLeads: number;
  effectiveLeads: number;
  cpl: number;
  trueCpl: number;
  cpm: number;
  formCvr: number;
  frequency: number;
  doubleCount: boolean;
  currency: string;
  above640Pct: number | null;
  scoredLeads: number;
}


const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Aggregates per-client KPIs over the currently-selected global date range.
 *
 * Attribution priority (each insights row → client):
 *   1. campaigns.client_id (via campaign_id on granular rows) — works even
 *      when the ad account isn't linked in this workspace, and is the only
 *      path for accounts shared across workspaces.
 *   2. meta_ad_account_clients (shared accounts in this workspace).
 *   3. meta_ad_accounts.client_id (single-tenant accounts).
 *
 * For each (client, date, account) tuple we prefer granular campaign rows
 * (meta_insights_granular_daily, level='campaign'); we only fall back to the
 * meta_insights_daily row when no granular campaign row exists for that
 * (account, date) — this prevents double counting.
 */
export function useClientsRangeMetrics() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;
  const { from, to, queryKey: rangeKey } = useDateRange();

  return useQuery({
    queryKey: ["clients-range-metrics", wsId, ...rangeKey],
    enabled: !!wsId,
    queryFn: async (): Promise<Record<number, ClientRangeMetrics>> => {
      const fromStr = fmtDate(from);
      const toStr = fmtDate(to);
      const fromISO = `${fromStr}T00:00:00.000Z`;
      const toISO = `${toStr}T23:59:59.999Z`;

      // 1a. Ad accounts in this workspace (currency + direct client linkage)
      const { data: accts, error: aErr } = await (supabase as any)
        .from("meta_ad_accounts")
        .select("id, client_id, currency")
        .eq("workspace_id", wsId);
      if (aErr) throw aErr;
      const acctDirectClient = new Map<string, number>();
      const acctCurrency = new Map<string, string>();
      (accts || []).forEach((a: any) => {
        if (a.client_id) acctDirectClient.set(a.id, a.client_id);
        acctCurrency.set(a.id, (a.currency || "USD").toUpperCase());
      });

      // 1b. Shared-account mappings (one account → many clients in this ws)
      const { data: shared } = await (supabase as any)
        .from("meta_ad_account_clients")
        .select("ad_account_id, client_id")
        .eq("workspace_id", wsId);
      const acctSharedClients = new Map<string, number[]>();
      for (const s of shared || []) {
        const arr = acctSharedClients.get(s.ad_account_id) || [];
        arr.push(s.client_id);
        acctSharedClients.set(s.ad_account_id, arr);
      }

      // 1c. Campaigns → client_id (works regardless of ad-account linkage).
      // We also use these campaign ids to pull granular insights across
      // any ad account, including accounts owned by other workspaces.
      const { data: campaignRows } = await (supabase as any)
        .from("campaigns")
        .select("id, client_id, ad_account_id")
        .eq("workspace_id", wsId);
      const campaignToClient = new Map<string, number>();
      const clientCampaignIds = new Map<number, string[]>();
      for (const c of campaignRows || []) {
        if (!c.client_id) continue;
        campaignToClient.set(String(c.id), c.client_id);
        const arr = clientCampaignIds.get(c.client_id) || [];
        arr.push(String(c.id));
        clientCampaignIds.set(c.client_id, arr);
      }
      const allCampaignIds = Array.from(campaignToClient.keys());

      // 2a. Granular insights at campaign level — attribute by campaign_id
      let granular: any[] = [];
      if (allCampaignIds.length > 0) {
        // Chunk to avoid URL length limits
        const chunkSize = 200;
        for (let i = 0; i < allCampaignIds.length; i += chunkSize) {
          const chunk = allCampaignIds.slice(i, i + chunkSize);
          const { data: g, error: gErr } = await (supabase as any)
            .from("meta_insights_granular_daily")
            .select("ad_account_id, date, object_id, spend, impressions, clicks, leads, raw")
            .eq("level", "campaign")
            .in("object_id", chunk)
            .gte("date", fromStr)
            .lte("date", toStr);
          if (gErr) throw gErr;
          granular = granular.concat(g || []);
        }
      }

      // Track which (ad_account_id, date) pairs are already represented by
      // granular campaign rows so we don't double-count via daily fallback.
      const granularKeys = new Set<string>();
      for (const r of granular) {
        granularKeys.add(`${r.ad_account_id}|${r.date}`);
      }

      // 2b. Daily insights — fallback for accounts/dates with no granular rows
      const { data: insights, error: iErr } = await (supabase as any)
        .from("meta_insights_daily")
        .select("ad_account_id, date, spend, impressions, clicks, leads, frequency")
        .eq("workspace_id", wsId)
        .gte("date", fromStr)
        .lte("date", toStr);
      if (iErr) throw iErr;

      // 3. Leads in window (for true-leads dedupe)
      const { data: leads, error: lErr } = await (supabase as any)
        .from("meta_leads")
        .select("client_id, lead_id, email, phone, created_time")
        .eq("workspace_id", wsId)
        .gte("created_time", fromISO)
        .lte("created_time", toISO);
      if (lErr) throw lErr;

      const agg: Record<number, {
        spend: number;
        impressions: number;
        clicks: number;
        reportedLeads: number;
        freqSum: number;
        freqWeight: number;
        leadKeys: Set<string>;
        scoredLeads: number;
        above640: number;
        currency: string | null;
      }> = {};

      const bucket = (cid: number) => {
        if (!agg[cid]) {
          agg[cid] = {
            spend: 0,
            impressions: 0,
            clicks: 0,
            reportedLeads: 0,
            freqSum: 0,
            freqWeight: 0,
            leadKeys: new Set(),
            scoredLeads: 0,
            above640: 0,
            currency: null,
          };
        }
        return agg[cid];
      };

      const noteCurrency = (b: { currency: string | null }, cur: string) => {
        if (b.currency == null) b.currency = cur;
        else if (b.currency !== cur && b.currency !== "MIXED") b.currency = "MIXED";
      };

      // Resolve client(s) for an insights row. Prefer campaign_id when given;
      // otherwise account-level fallbacks. Returns a list because a shared
      // account may attribute to multiple clients (callers should split, but
      // for daily fallback we attribute to the first match to avoid duplicate
      // spend across clients).
      const clientsForCampaign = (campaignId: string): number[] => {
        const c = campaignToClient.get(campaignId);
        return c ? [c] : [];
      };
      const clientsForAccount = (acctId: string): number[] => {
        const direct = acctDirectClient.get(acctId);
        if (direct) return [direct];
        return acctSharedClients.get(acctId) || [];
      };

      // Apply granular campaign rows
      for (const row of granular) {
        const cids = clientsForCampaign(String(row.object_id));
        if (cids.length === 0) continue;
        for (const cid of cids) {
          const b = bucket(cid);
          noteCurrency(b, acctCurrency.get(row.ad_account_id) || "USD");
          const imp = Number(row.impressions || 0);
          b.spend += Number(row.spend || 0);
          b.impressions += imp;
          b.clicks += Number(row.clicks || 0);
          b.reportedLeads += Number(row.leads || 0);
          const f = Number(row.raw?.frequency || 0);
          if (f > 0 && imp > 0) {
            b.freqSum += f * imp;
            b.freqWeight += imp;
          }
        }
      }

      // Apply daily fallback only for (account, date) pairs not covered above
      for (const row of insights || []) {
        const key = `${row.ad_account_id}|${row.date}`;
        if (granularKeys.has(key)) continue;
        const cids = clientsForAccount(row.ad_account_id);
        if (cids.length === 0) continue;
        const cid = cids[0]; // attribute to the primary mapping
        const b = bucket(cid);
        noteCurrency(b, acctCurrency.get(row.ad_account_id) || "USD");
        const imp = Number(row.impressions || 0);
        b.spend += Number(row.spend || 0);
        b.impressions += imp;
        b.clicks += Number(row.clicks || 0);
        b.reportedLeads += Number(row.leads || 0);
        const f = Number(row.frequency || 0);
        if (f > 0 && imp > 0) {
          b.freqSum += f * imp;
          b.freqWeight += imp;
        }
      }

      // Field_data for credit-score scoring
      const { data: scoredRaw } = await (supabase as any)
        .from("meta_leads")
        .select("client_id, field_data")
        .eq("workspace_id", wsId)
        .gte("created_time", fromISO)
        .lte("created_time", toISO);

      for (const row of leads || []) {
        if (!row.client_id) continue;
        const b = bucket(row.client_id);
        const email = (row.email || "").toString().trim().toLowerCase();
        const phone = (row.phone || "").toString().replace(/\D+/g, "");
        const key = email || phone || `lid:${row.lead_id ?? ""}`;
        b.leadKeys.add(key);
      }

      for (const row of scoredRaw || []) {
        if (!row.client_id) continue;
        const fields = Array.isArray(row.field_data) ? row.field_data : [];
        let hasScore = false;
        let isAbove = false;
        for (const f of fields) {
          const name = String(f?.name || "").toLowerCase();
          if (!name.includes("credit_score") && !name.includes("credit score")) continue;
          const val = String(f?.values?.[0] ?? "").toLowerCase();
          if (!val) continue;
          hasScore = true;
          if (val.startsWith("above")) isAbove = true;
          break;
        }
        if (hasScore) {
          const b = bucket(row.client_id);
          b.scoredLeads += 1;
          if (isAbove) b.above640 += 1;
        }
      }

      const out: Record<number, ClientRangeMetrics> = {};
      for (const [cidStr, b] of Object.entries(agg)) {
        const cid = Number(cidStr);
        const trueLeads = b.leadKeys.size;
        const coverage = b.reportedLeads > 0 ? trueLeads / b.reportedLeads : 1;
        const effectiveLeads = trueLeads > 0 ? trueLeads : b.reportedLeads;
        const cpl = effectiveLeads > 0 ? b.spend / effectiveLeads : 0;
        const reliableTrueCpl = trueLeads > 0 && coverage >= 0.8;
        const trueCpl = reliableTrueCpl ? b.spend / trueLeads : cpl;
        const cpm = b.impressions > 0 ? (b.spend / b.impressions) * 1000 : 0;
        const formCvr = b.clicks > 0 ? (b.reportedLeads / b.clicks) * 100 : 0;
        const frequency = b.freqWeight > 0 ? b.freqSum / b.freqWeight : 0;
        const above640Pct = b.scoredLeads > 0 ? (b.above640 / b.scoredLeads) * 100 : null;
        out[cid] = {
          clientId: cid,
          spend: b.spend,
          impressions: b.impressions,
          clicks: b.clicks,
          reportedLeads: b.reportedLeads,
          trueLeads,
          effectiveLeads,
          cpl,
          trueCpl,
          cpm,
          formCvr,
          frequency,
          currency: b.currency || "USD",
          doubleCount: reliableTrueCpl && b.reportedLeads > trueLeads * 1.15,
          above640Pct,
          scoredLeads: b.scoredLeads,
        };
      }
      return out;
    },
  });
}
