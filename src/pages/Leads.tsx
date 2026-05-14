import { MultiChannelLeads } from "@/components/leads/MultiChannelLeads";
import { LeadSyncHealth } from "@/components/leads/LeadSyncHealth";

export default function Leads() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Manage leads across every channel — Meta, Google, TikTok, LinkedIn, and manual imports.
          View answers, move stages, and add notes per lead.
        </p>
      </div>
      <LeadSyncHealth />
      <MultiChannelLeads />
    </div>
  );
}
