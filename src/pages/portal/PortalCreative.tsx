import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, MessageSquareWarning, ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState } from "react";

type AdRow = {
  id: string;
  workspace_id: string;
  client_id: number;
  name: string | null;
  effective_status: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  title: string | null;
  body: string | null;
  call_to_action_type: string | null;
  link_url: string | null;
  media_type: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  ctr: number | null;
  cpl: number | null;
  campaign_name: string | null;
  page_name: string | null;
};

type Approval = {
  ad_id: string;
  status: "pending" | "approved" | "changes_requested";
  feedback: string | null;
  decided_at: string | null;
};

export default function PortalCreative() {
  const { clientId, client } = usePortalClient();
  const { user } = useAuth();
  const qc = useQueryClient();

  const ads = useQuery({
    queryKey: ["portal-creatives", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ads")
        .select(
          "id, workspace_id, client_id, name, effective_status, thumbnail_url, image_url, title, body, call_to_action_type, link_url, media_type, spend, impressions, clicks, leads, ctr, cpl, campaign_name, page_name"
        )
        .eq("client_id", clientId!)
        .order("spend", { ascending: false, nullsFirst: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as AdRow[];
    },
  });

  const approvals = useQuery({
    queryKey: ["portal-creative-approvals", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creative_approvals")
        .select("ad_id, status, feedback, decided_at")
        .eq("client_id", clientId!);
      if (error) throw error;
      return (data ?? []) as Approval[];
    },
  });

  useEffect(() => {
    if (!clientId) return;
    const ch = supabase
      .channel(`creative-approvals-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "creative_approvals", filter: `client_id=eq.${clientId}` },
        () => qc.invalidateQueries({ queryKey: ["portal-creative-approvals", clientId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [clientId, qc]);

  const approvalMap = useMemo(() => {
    const m = new Map<string, Approval>();
    (approvals.data ?? []).forEach((a) => m.set(a.ad_id, a));
    return m;
  }, [approvals.data]);

  const decide = useMutation({
    mutationFn: async (args: { ad: AdRow; status: Approval["status"]; feedback?: string }) => {
      const { error } = await supabase.from("creative_approvals").upsert(
        {
          client_id: args.ad.client_id,
          workspace_id: args.ad.workspace_id,
          ad_id: args.ad.id,
          status: args.status,
          feedback: args.feedback ?? null,
          decided_by: user?.id ?? null,
          decided_at: new Date().toISOString(),
        },
        { onConflict: "client_id,ad_id" }
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "approved" ? "Approved" : "Changes requested");
      qc.invalidateQueries({ queryKey: ["portal-creative-approvals", clientId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  if (!clientId) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const rows = ads.data ?? [];
  const pendingCount = rows.filter((r) => (approvalMap.get(r.id)?.status ?? "pending") === "pending").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Creatives</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live ads running for {client?.name ?? "your account"}. Approve them or request changes — your team is notified instantly.
          </p>
        </div>
        {rows.length > 0 && (
          <Badge variant="outline" className="gap-1.5">
            <CheckCircle2 className="h-3 w-3" /> {rows.length - pendingCount} of {rows.length} reviewed
          </Badge>
        )}
      </div>

      {ads.isLoading && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </Card>
      )}

      {!ads.isLoading && rows.length === 0 && (
        <Card className="p-12 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No creatives yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Once your campaigns launch, every ad will appear here for review.
          </p>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((ad) => (
          <CreativeCard
            key={ad.id}
            ad={ad}
            approval={approvalMap.get(ad.id)}
            onDecide={(status, feedback) => decide.mutate({ ad, status, feedback })}
            pending={decide.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function CreativeCard({
  ad,
  approval,
  onDecide,
  pending,
}: {
  ad: AdRow;
  approval?: Approval;
  onDecide: (status: Approval["status"], feedback?: string) => void;
  pending: boolean;
}) {
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const status = approval?.status ?? "pending";
  const thumb = ad.thumbnail_url || ad.image_url;

  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="relative aspect-video bg-muted">
        {thumb ? (
          <img src={thumb} alt={ad.name ?? ""} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        <Badge
          className={cn(
            "absolute top-2 left-2 text-[10px]",
            status === "approved" && "bg-success text-success-foreground",
            status === "changes_requested" && "bg-destructive text-destructive-foreground",
            status === "pending" && "bg-background/90 text-foreground border border-border"
          )}
        >
          {status === "approved" ? "Approved" : status === "changes_requested" ? "Changes requested" : "Pending review"}
        </Badge>
      </div>

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <div>
          <p className="font-semibold text-sm line-clamp-1">{ad.name || "Untitled ad"}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{ad.campaign_name || "—"}</p>
        </div>

        {(ad.title || ad.body) && (
          <div className="text-xs text-muted-foreground space-y-1">
            {ad.title && <p className="font-medium text-foreground line-clamp-1">{ad.title}</p>}
            {ad.body && <p className="line-clamp-2">{ad.body}</p>}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-border">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Spend</p>
            <p className="text-sm font-semibold tabular-nums">${Number(ad.spend ?? 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Leads</p>
            <p className="text-sm font-semibold tabular-nums">{ad.leads ?? 0}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CPL</p>
            <p className="text-sm font-semibold tabular-nums">${Number(ad.cpl ?? 0).toFixed(0)}</p>
          </div>
        </div>

        {ad.link_url && (
          <a
            href={ad.link_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View landing page <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {approval?.feedback && (
          <div className="rounded-md bg-muted p-2 text-xs">
            <p className="font-medium text-foreground mb-0.5">Your feedback</p>
            <p className="text-muted-foreground whitespace-pre-wrap">{approval.feedback}</p>
          </div>
        )}

        {showFeedback ? (
          <div className="space-y-2">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What would you like changed?"
              className="min-h-[70px] text-xs"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs"
                onClick={() => {
                  setShowFeedback(false);
                  setFeedback("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-8 text-xs"
                disabled={!feedback.trim() || pending}
                onClick={() => {
                  onDecide("changes_requested", feedback.trim());
                  setShowFeedback(false);
                  setFeedback("");
                }}
              >
                Send
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-auto">
            <Button
              size="sm"
              variant={status === "approved" ? "default" : "outline"}
              className="flex-1 h-8 text-xs gap-1"
              disabled={pending}
              onClick={() => onDecide("approved")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button
              size="sm"
              variant={status === "changes_requested" ? "destructive" : "outline"}
              className="flex-1 h-8 text-xs gap-1"
              disabled={pending}
              onClick={() => setShowFeedback(true)}
            >
              <MessageSquareWarning className="h-3.5 w-3.5" /> Changes
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
