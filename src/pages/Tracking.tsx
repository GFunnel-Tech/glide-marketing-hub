import { TrackingPanel } from "@/components/tracking/TrackingPanel";

export default function Tracking() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tracking</h1>
        <p className="text-sm text-muted-foreground">Pixels, tags, and events — like GTM, built in.</p>
      </div>
      <TrackingPanel title="Workspace tracking" />
    </div>
  );
}
