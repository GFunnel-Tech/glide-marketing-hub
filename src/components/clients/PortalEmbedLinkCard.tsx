import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type EmbedToken = {
  id: string;
  token: string;
  location_id: string;
  revoked: boolean;
  last_used_at: string | null;
  created_at: string;
};

const PORTAL_ORIGIN = "https://metahub.gfunnel.com";

function genToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates the signed GHL embed link for a client:
 *   https://metahub.gfunnel.com/portal/<ghl location id>?t=<token>
 * Paste it into the sub-account's custom menu link / custom page. Anyone
 * opening it is signed straight into that client's portal, so the link is
 * revocable here.
 */
export function PortalEmbedLinkCard({
  clientId,
  workspaceId,
  locationId,
}: {
  clientId: number;
  workspaceId: string | null;
  locationId: string | null;
}) {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<EmbedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("portal_embed_tokens")
      .select("id, token, location_id, revoked, last_used_at, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setTokens((data as EmbedToken[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const create = async () => {
    if (!locationId) return;
    setCreating(true);
    const { error } = await supabase.from("portal_embed_tokens").insert({
      client_id: clientId,
      workspace_id: workspaceId,
      location_id: locationId,
      token: genToken(),
      created_by: user?.id ?? null,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Embed link created");
    load();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("portal_embed_tokens").update({ revoked: true }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Link revoked");
    load();
  };

  const copy = (t: EmbedToken) => {
    navigator.clipboard.writeText(`${PORTAL_ORIGIN}/portal/${t.location_id}?t=${t.token}`);
    toast.success("Embed link copied");
  };

  const active = tokens.filter((t) => !t.revoked);

  return (
    <Card className="rounded-xl p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Link2 className="h-4 w-4" />
        </span>
        <h3 className="font-semibold">GHL embed link</h3>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Paste this into the sub-account's custom menu link. Anyone opening it inside GHL is signed
        straight into this client's portal — no separate password.
      </p>

      {!locationId ? (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Map a GHL sub-account to this client first — the embed link is scoped to its location ID.
        </p>
      ) : loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-2">
          {active.length === 0 && (
            <p className="text-sm text-muted-foreground">No embed link yet.</p>
          )}
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-sm"
            >
              <code className="flex-1 truncate text-xs text-muted-foreground">
                {`${PORTAL_ORIGIN}/portal/${t.location_id}?t=${t.token.slice(0, 8)}…`}
              </code>
              {t.revoked ? (
                <Badge variant="secondary">Revoked</Badge>
              ) : (
                <>
                  <Badge variant="secondary">
                    {t.last_used_at ? `Used ${new Date(t.last_used_at).toLocaleDateString()}` : "Unused"}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => copy(t)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => revoke(t.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={create} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {active.length ? "New link" : "Create embed link"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
