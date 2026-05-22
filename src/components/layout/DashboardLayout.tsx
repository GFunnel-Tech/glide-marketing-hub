import { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { MetaScopeBanner } from "@/components/integrations/MetaScopeBanner";

export function DashboardLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ImpersonationBanner />
      <MetaScopeBanner />
      <TopNav />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        {children || <Outlet />}
      </main>
    </div>
  );
}

