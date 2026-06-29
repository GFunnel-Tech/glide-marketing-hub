import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function OnboardingWizardPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const clientIdParam = params.get("clientId");
  const clientId = clientIdParam ? Number(clientIdParam) : undefined;

  const clientQ = useQuery({
    queryKey: ["client-for-wizard", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, brand, workspace_id")
        .eq("id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const workspaceId = clientQ.data?.workspace_id ?? currentWorkspace?.id ?? null;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open && clientId) {
      // After closing, drop the modal but keep the page so the link can be re-opened.
    }
  }, [open, clientId]);

  if (!clientId) {
    return (
      <Card className="p-8 max-w-md mx-auto mt-12">
        <h2 className="text-lg font-semibold text-foreground">Pick a client</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Open this page with <code>?clientId=…</code> to launch the onboarding wizard for a specific client.
        </p>
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate("/onboarding")}>
            Back to onboarding board
          </Button>
        </div>
      </Card>
    );
  }

  if (clientQ.isLoading) {
    return <div className="p-10 text-center text-muted-foreground">Loading client…</div>;
  }

  if (!clientQ.data) {
    return (
      <Card className="p-8 max-w-md mx-auto mt-12">
        <h2 className="text-lg font-semibold text-foreground">Client not found</h2>
        <p className="text-sm text-muted-foreground mt-1">Check the URL and try again.</p>
        <div className="mt-4"><Button variant="outline" onClick={() => navigate("/onboarding")}>Back</Button></div>
      </Card>
    );
  }

  if (!workspaceId) {
    return (
      <Card className="p-8 max-w-md mx-auto mt-12">
        <h2 className="text-lg font-semibold text-foreground">No workspace</h2>
        <p className="text-sm text-muted-foreground mt-1">This client has no workspace assigned. Set one before running onboarding.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Onboarding wizard</h1>
        <p className="text-sm text-muted-foreground">
          Running for <span className="font-medium text-foreground">{clientQ.data.name} ({clientQ.data.brand})</span>.
        </p>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            The wizard is open in a popup. If you closed it, use the button below to reopen.
          </p>
          <Button className="mt-3" onClick={() => setOpen(true)} disabled={open}>Reopen wizard</Button>
        </Card>
      </div>

      <OnboardingWizard
        open={open}
        onOpenChange={setOpen}
        clientId={clientQ.data.id}
        workspaceId={workspaceId}
        brandLabel={clientQ.data.brand ?? clientQ.data.name}
      />
    </>
  );
}
