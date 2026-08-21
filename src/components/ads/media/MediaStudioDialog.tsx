import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ImageEditor, type StudioSource } from "./studio/ImageEditor";
import { VideoEditor } from "./studio/VideoEditor";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sources: StudioSource[];
  onExport: (asset: { url: string; name: string; type: "image" | "video" }) => void;
}

export function MediaStudioDialog({ open, onOpenChange, sources, onExport }: Props) {
  const { currentWorkspace } = useWorkspace();
  const hasVideo = sources.some((s) => s.type === "video");
  const [tab, setTab] = useState<"image" | "video">(hasVideo ? "video" : "image");

  if (!currentWorkspace) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>Creative Studio</DialogTitle>
          <DialogDescription>
            Design images and cut video timelines, then push the export straight into the ad creative.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "image" | "video")}>
          <TabsList>
            <TabsTrigger value="image" className="text-xs">Image editor</TabsTrigger>
            <TabsTrigger value="video" className="text-xs">Video timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="image" className="mt-3">
            <ImageEditor
              workspaceId={currentWorkspace.id}
              sources={sources}
              onExport={(a) => { onExport(a); onOpenChange(false); }}
            />
          </TabsContent>

          <TabsContent value="video" className="mt-3">
            <VideoEditor
              workspaceId={currentWorkspace.id}
              sources={sources}
              onExport={(a) => { onExport(a); onOpenChange(false); }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
