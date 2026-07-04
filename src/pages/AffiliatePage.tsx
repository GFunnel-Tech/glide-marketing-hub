import { useState } from "react";
import { Handshake } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/affiliate/OverviewTab";
import { PartnersTab } from "@/components/affiliate/PartnersTab";
import { ReferralsTab } from "@/components/affiliate/ReferralsTab";
import { CommissionsTab } from "@/components/affiliate/CommissionsTab";
import { PayoutsTab } from "@/components/affiliate/PayoutsTab";
import { ApiIntegrationsTab } from "@/components/affiliate/ApiIntegrationsTab";

export default function AffiliatePage() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
          <Handshake className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Affiliates & Partners</h1>
          <p className="text-sm text-muted-foreground">
            Manage partners, referrals, commissions, and payouts — connected to Partnero and other networks via API.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="api">API & Integrations</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab onGoToTab={setTab} />
        </TabsContent>
        <TabsContent value="partners" className="mt-4">
          <PartnersTab />
        </TabsContent>
        <TabsContent value="referrals" className="mt-4">
          <ReferralsTab />
        </TabsContent>
        <TabsContent value="commissions" className="mt-4">
          <CommissionsTab />
        </TabsContent>
        <TabsContent value="payouts" className="mt-4">
          <PayoutsTab />
        </TabsContent>
        <TabsContent value="api" className="mt-4">
          <ApiIntegrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
