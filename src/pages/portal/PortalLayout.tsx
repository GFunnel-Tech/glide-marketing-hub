import { CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { PortalTopNav } from "@/components/layout/PortalTopNav";
import { PortalChatBubble } from "@/components/portal/PortalChatBubble";

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

export default function PortalLayout() {
  return (
    <div style={emmTheme} className="flex flex-col min-h-screen bg-background text-foreground" data-portal-root>
      <PortalTopNav />
      <main className="flex-1 overflow-auto px-4 md:px-8 py-6">
        <Outlet />
      </main>
      <PortalChatBubble />
    </div>
  );
}
