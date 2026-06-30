import { CSSProperties } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { PortalTopNav } from "@/components/layout/PortalTopNav";
import { PortalChatBubble } from "@/components/portal/PortalChatBubble";
import { useViewAsClientId, setViewAsClientId, usePortalClient } from "@/hooks/usePortalClients";
import { Eye, X } from "lucide-react";

// EMM brand palette as CSS-var overrides scoped to this subtree.
const emmTheme: CSSProperties = {
  ["--background" as any]: "210 40% 98%",
  ["--foreground" as any]: "222 47% 11%",
  ["--card" as any]: "0 0% 100%",
  ["--card-foreground" as any]: "222 47% 11%",
  ["--popover" as any]: "0 0% 100%",
  ["--popover-foreground" as any]: "222 47% 11%",
  ["--primary" as any]: "218 64% 30%",
  ["--primary-foreground" as any]: "0 0% 100%",
  ["--secondary" as any]: "210 40% 96%",
  ["--secondary-foreground" as any]: "222 47% 11%",
  ["--muted" as any]: "210 40% 96%",
  ["--muted-foreground" as any]: "215 16% 47%",
  ["--accent" as any]: "217 91% 60%",
  ["--accent-foreground" as any]: "0 0% 100%",
  ["--destructive" as any]: "0 73% 51%",
  ["--destructive-foreground" as any]: "0 0% 100%",
  ["--border" as any]: "214 32% 91%",
  ["--input" as any]: "214 32% 91%",
  ["--ring" as any]: "218 64% 30%",
  ["--success" as any]: "142 71% 35%",
  ["--warning" as any]: "32 95% 44%",
};

function ViewAsBanner() {
  const viewAs = useViewAsClientId();
  const { client } = usePortalClient();
  const navigate = useNavigate();
  if (!viewAs) return null;
  const name = client?.name ?? `Client #${viewAs}`;
  return (
    <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="truncate">
          <strong className="font-semibold">View-as mode</strong> — previewing portal as{" "}
          <span className="font-mono font-semibold">{name}</span>
        </span>
      </div>
      <button
        onClick={() => {
          setViewAsClientId(null);
          navigate(`/client/${viewAs}`);
        }}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-800 hover:bg-indigo-900 font-semibold text-xs shrink-0"
      >
        <X className="h-3.5 w-3.5" /> Exit view-as
      </button>
    </div>
  );
}

export default function PortalLayout() {
  return (
    <div style={emmTheme} className="flex flex-col min-h-screen bg-background text-foreground" data-portal-root>
      <ViewAsBanner />
      <PortalTopNav />
      <main className="flex-1 overflow-auto px-4 md:px-8 py-6">
        <Outlet />
      </main>
      <PortalChatBubble />
    </div>
  );
}
