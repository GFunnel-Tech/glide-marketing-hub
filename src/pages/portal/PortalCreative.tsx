import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FolderSync } from "lucide-react";

export default function PortalCreative() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Creative Hub</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload assets, sync from Drive, and manage scripts.</p>
      </div>

      <Card className="p-8 border-dashed border-2">
        <div className="text-center">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">Drag & drop files here</h3>
          <p className="mt-1 text-sm text-muted-foreground">JPG, PNG, MP4, MOV, PDF · up to 500MB per file</p>
          <Button className="mt-4 bg-[hsl(var(--primary))]">Browse files</Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><FolderSync className="h-4 w-4" /> Google Drive sync</h3>
            <p className="text-sm text-muted-foreground mt-1">Connect Drive to auto-sync your assets every 24h.</p>
          </div>
          <Button variant="outline">Connect Google Drive</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Asset library</h3>
        <p className="text-sm text-muted-foreground">Your uploaded assets will appear here.</p>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Scripts</h3>
        <p className="text-sm text-muted-foreground">Video and ad scripts will appear here as your team produces them.</p>
      </Card>
    </div>
  );
}
