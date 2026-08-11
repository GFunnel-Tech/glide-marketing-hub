import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLinkedMetaClients } from "@/hooks/useLinkedMetaClients";

/** Amber caution icon shown when a client has no Meta ad account linked. */
export function NoMetaAccountWarning({ clientId }: { clientId: number }) {
  const { data: linked, isLoading } = useLinkedMetaClients();
  if (isLoading || !linked || linked.has(clientId)) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/settings?tab=integrations"
            onClick={(e) => e.stopPropagation()}
            aria-label="No Meta ad account linked — open Account Mapping"
            className="inline-flex shrink-0 items-center text-warning hover:opacity-80"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>No Meta ad account linked — click to map it</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
