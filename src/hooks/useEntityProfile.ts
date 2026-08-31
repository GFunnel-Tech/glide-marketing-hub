import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export type EntityLevel = "campaign" | "adset" | "ad";

export interface EntityDay {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  cpm: number;
  ctr: number;
}

export interface EntityTotals {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  cpm: number;
  ctr: number;
}

export interface EntityChild {
  id: string;
  name: string;
  level: EntityLevel;
  spend: number;
  leads: number;
  clicks: number;
  impressions: number;
  cpl: number;
  ctr: number;
}

export interface EntityProfileData {
  id: string;
  level: EntityLevel;
  name: string;
  parentCampaignId: string | null;
  parentAdsetId: string | null;
  adAccountId: string | null;
  days: EntityDay[];
  totals: EntityTotals;
  prevTotals: EntityTotals;
  children: EntityChild[];
  ad: Record<string, unknown> | null;
}

const emptyTotals = (): EntityTotals => ({
  spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: 0, cpm: 0, ctr: 0,
});

function derive(t: EntityTotals): EntityTotals {
  return {
    ...t,
    cpl: t.leads > 0 ? t.spend / t.leads : 0,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
  };
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const childLevel: Record<EntityLevel, EntityLevel | null> = {
  campaign: "adset",
  adset: "ad",
  ad: null,
};

export function useEntityProfile(level: EntityLevel, objectId: string | undefined, days = 30) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  return useQuery<EntityProfileData | null>({
    queryKey: ["entity-profile", workspaceId, level, objectId, days],
    enabled: !!workspaceId && !!objectId,
    queryFn: async () => {
      const since = isoDaysAgo(days * 2);
      const cutoff = isoDaysAgo(days);

      const { data: rows, error } = await supabase
        .from("meta_insights_granular_daily")
        .select("date,spend,impressions,clicks,leads,object_id,object_name,level,parent_campaign_id,parent_adset_id,ad_account_id")
        .eq("workspace_id", workspaceId!)
        .eq("level", level)
        .eq("object_id", objectId!)
        .gte("date", since)
        .order("date", { ascending: true });
      if (error) throw error;

      const all = rows ?? [];
      const current = all.filter((r) => r.date > cutoff);
      const previous = all.filter((r) => r.date <= cutoff);

      const sum = (list: typeof all): EntityTotals =>
        derive(list.reduce((acc, r) => ({
          ...acc,
          spend: acc.spend + Number(r.spend ?? 0),
          impressions: acc.impressions + Number(r.impressions ?? 0),
          clicks: acc.clicks + Number(r.clicks ?? 0),
          leads: acc.leads + Number(r.leads ?? 0),
        }), emptyTotals()));

      const byDate = new Map<string, EntityDay>();
      for (const r of current) {
        const d = byDate.get(r.date) ?? { date: r.date, spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: 0, cpm: 0, ctr: 0 };
        d.spend += Number(r.spend ?? 0);
        d.impressions += Number(r.impressions ?? 0);
        d.clicks += Number(r.clicks ?? 0);
        d.leads += Number(r.leads ?? 0);
        byDate.set(r.date, d);
      }
      const dayList = [...byDate.values()].map((d) => ({
        ...d,
        cpl: d.leads > 0 ? d.spend / d.leads : 0,
        cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
        ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      })).sort((a, b) => a.date.localeCompare(b.date));

      const head = all[all.length - 1];

      // Children
      let children: EntityChild[] = [];
      const cl = childLevel[level];
      if (cl) {
        const parentCol = level === "campaign" ? "parent_campaign_id" : "parent_adset_id";
        const { data: kids } = await supabase
          .from("meta_insights_granular_daily")
          .select("object_id,object_name,spend,impressions,clicks,leads")
          .eq("workspace_id", workspaceId!)
          .eq("level", cl)
          .eq(parentCol, objectId!)
          .gt("date", cutoff);
        const map = new Map<string, EntityChild>();
        for (const k of kids ?? []) {
          const e = map.get(k.object_id) ?? {
            id: k.object_id, name: k.object_name ?? k.object_id, level: cl,
            spend: 0, leads: 0, clicks: 0, impressions: 0, cpl: 0, ctr: 0,
          };
          e.spend += Number(k.spend ?? 0);
          e.impressions += Number(k.impressions ?? 0);
          e.clicks += Number(k.clicks ?? 0);
          e.leads += Number(k.leads ?? 0);
          if (k.object_name) e.name = k.object_name;
          map.set(k.object_id, e);
        }
        children = [...map.values()].map((c) => ({
          ...c,
          cpl: c.leads > 0 ? c.spend / c.leads : 0,
          ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
        })).sort((a, b) => b.spend - a.spend);
      }

      // Ad-level config record
      let ad: Record<string, unknown> | null = null;
      if (level === "ad") {
        const { data } = await supabase
          .from("meta_ads")
          .select("*")
          .eq("workspace_id", workspaceId!)
          .eq("id", objectId!)
          .maybeSingle();
        ad = (data as Record<string, unknown>) ?? null;
      }

      return {
        id: objectId!,
        level,
        name: head?.object_name ?? (ad?.name as string) ?? objectId!,
        parentCampaignId: head?.parent_campaign_id ?? (ad?.campaign_id as string) ?? null,
        parentAdsetId: head?.parent_adset_id ?? (ad?.adset_id as string) ?? null,
        adAccountId: head?.ad_account_id ?? (ad?.ad_account_id as string) ?? null,
        days: dayList,
        totals: sum(current),
        prevTotals: sum(previous),
        children,
        ad,
      };
    },
  });
}

export interface AuditFinding {
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
}

export function buildAudit(data: EntityProfileData): AuditFinding[] {
  const f: AuditFinding[] = [];
  const { totals, prevTotals, days, children, ad, level } = data;

  if (totals.spend === 0) {
    f.push({ severity: "warning", title: "No spend in range", detail: "This entity hasn't spent in the selected window — it may be paused or not delivering." });
  }
  if (totals.spend > 0 && totals.leads === 0) {
    f.push({ severity: "error", title: "Spend with zero results", detail: `$${totals.spend.toFixed(2)} spent with no leads recorded. Check the form, pixel, and destination.` });
  }
  if (totals.ctr > 0 && totals.ctr < 0.8) {
    f.push({ severity: "warning", title: "Low CTR", detail: `${totals.ctr.toFixed(2)}% click-through — creative fatigue or weak hook. Refresh the creative.` });
  }
  if (prevTotals.cpl > 0 && totals.cpl > prevTotals.cpl * 1.25) {
    f.push({ severity: "warning", title: "CPL rising", detail: `CPL moved from $${prevTotals.cpl.toFixed(2)} to $${totals.cpl.toFixed(2)} versus the prior period.` });
  }
  if (days.length > 0 && days.length < 4 && totals.spend > 0) {
    f.push({ severity: "info", title: "Still learning", detail: `Only ${days.length} day(s) of delivery. Avoid edits until it exits the learning phase.` });
  }
  const activeDays = days.filter((d) => d.spend > 0).length;
  if (activeDays > 0 && totals.spend / activeDays < 5) {
    f.push({ severity: "info", title: "Low daily budget", detail: `Averaging $${(totals.spend / activeDays).toFixed(2)}/day — likely too thin to exit learning.` });
  }
  if (level !== "ad" && children.length === 0) {
    f.push({ severity: "warning", title: "No children with delivery", detail: "Nothing beneath this level has delivered in range." });
  }
  if (level !== "ad" && children.length > 1) {
    const spendy = children.filter((c) => c.spend > 0);
    if (spendy.length === 1) {
      f.push({ severity: "info", title: "Budget concentration", detail: `Only "${spendy[0].name}" is getting delivery out of ${children.length} children.` });
    }
  }
  if (ad) {
    if ((ad.effective_status as string) && ad.effective_status !== "ACTIVE") {
      f.push({ severity: "info", title: `Status: ${ad.effective_status}`, detail: "This ad isn't active on Meta." });
    }
    if (!ad.image_url && !ad.thumbnail_url) {
      f.push({ severity: "warning", title: "No creative asset found", detail: "Glide Media has no image or thumbnail synced for this ad." });
    }
    if (!ad.title) f.push({ severity: "warning", title: "Missing headline", detail: "No headline synced on this ad's creative." });
    if (!ad.body) f.push({ severity: "warning", title: "Missing primary text", detail: "No body copy synced on this ad's creative." });
    if (!ad.call_to_action_type) f.push({ severity: "info", title: "No call to action", detail: "This creative has no CTA button configured." });
    const link = ad.link_url as string | null;
    if (link && !/utm_/i.test(link)) {
      f.push({ severity: "info", title: "No UTM parameters", detail: "The destination link has no UTM tags, so attribution will be incomplete." });
    }
  }
  if (f.length === 0) {
    f.push({ severity: "info", title: "No issues detected", detail: "Delivery, creative, and configuration checks all passed." });
  }
  return f;
}
