import { Link } from "react-router-dom";
import { AlertOctagon, ArrowRight } from "lucide-react";
import { useGhlConnectionStatus } from "@/hooks/useGhlConnectionStatus";
import { Button } from "@/components/ui/button";

export function GhlConnectionBanner() {
  const { data } = useGhlConnectionStatus();
  if (!data || data.failedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm border-b bg-destructive/10 border-destructive/30 text-destructive">
      <AlertOctagon className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">GHL connection failed</span>
        <span className="ml-2 text-destructive/80 hidden sm:inline">
          {data.failedCount} lead{data.failedCount === 1 ? "" : "s"} stuck in the last 24h due to an invalid API key.
        </span>
      </div>
      <Button asChild size="sm" variant="outline" className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10">
        <Link to="/settings/integrations">
          Fix key <ArrowRight className="h-3 w-3 ml-1" />
        </Link>
      </Button>
    </div>
  );
}
