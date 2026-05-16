import { useEffect, useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import type { MediaAsset } from "../types";
import { cn } from "@/lib/utils";

interface Props {
  value: MediaAsset[];
  onChange: (next: MediaAsset[]) => void;
  max?: number;
  label?: string;
  accept?: "image" | "video" | "both";
}

export function MediaUploader({ value, onChange, max = 10, label = "Add media", accept = "both" }: Props) {
  const { currentWorkspace } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const acceptStr = accept === "image" ? "image/*" : accept === "video" ? "video/*" : "image/*,video/*";

  const handleFiles = async (files: FileList | null) => {
    if (!files || !currentWorkspace) return;
    setUploading(true);
    try {
      const next: MediaAsset[] = [...value];
      for (const file of Array.from(files)) {
        if (next.length >= max) break;
        const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
        const path = `${currentWorkspace.id}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage.from("ad-creatives").upload(path, file, {
          contentType: file.type, upsert: false,
        });
        if (error) { toast.error(`Upload failed: ${error.message}`); continue; }
        const { data: pub } = supabase.storage.from("ad-creatives").getPublicUrl(path);
        next.push({ id: crypto.randomUUID(), url: pub.publicUrl, type, name: file.name });
      }
      onChange(next);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (id: string) => onChange(value.filter((m) => m.id !== id));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {value.map((m) => (
          <div key={m.id} className="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted group">
            {m.type === "image" ? (
              <img src={m.url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Video className="h-6 w-6 text-muted-foreground" /></div>
            )}
            <button onClick={() => remove(m.id)} className="absolute top-1 right-1 bg-background/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors",
              uploading && "opacity-50",
            )}
          >
            <Upload className="h-5 w-5" />
            <span className="text-[10px]">{uploading ? "..." : label}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={acceptStr}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="text-xs text-muted-foreground">{value.length} / {max} {accept === "image" ? "images" : accept === "video" ? "videos" : "files"}</div>
    </div>
  );
}
