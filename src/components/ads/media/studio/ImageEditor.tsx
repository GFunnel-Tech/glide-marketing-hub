import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Type, Square, Trash2, Loader2, ImagePlus, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { RATIOS, drawCover, uploadStudioBlob } from "./uploadBlob";
import { cn } from "@/lib/utils";

export interface StudioSource {
  url: string;
  name?: string;
  type: "image" | "video";
}

type Layer =
  | {
      id: string;
      kind: "text";
      text: string;
      x: number;
      y: number;
      size: number;
      color: string;
      weight: 400 | 700 | 900;
      align: "left" | "center" | "right";
      bg: string | null;
    }
  | { id: string; kind: "rect"; x: number; y: number; w: number; h: number; color: string; opacity: number }
  | { id: string; kind: "image"; url: string; x: number; y: number; w: number; h: number };

interface Props {
  workspaceId: string;
  sources: StudioSource[];
  onExport: (asset: { url: string; name: string; type: "image" }) => void;
}

const uid = () => crypto.randomUUID();

export function ImageEditor({ workspaceId, sources, onExport }: Props) {
  const images = useMemo(() => sources.filter((s) => s.type === "image"), [sources]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(RATIOS[0].id);
  const [baseUrl, setBaseUrl] = useState(images[0]?.url ?? "");
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [bgColor, setBgColor] = useState("#0f172a");
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const loaded = useRef<Map<string, HTMLImageElement>>(new Map());
  const [, force] = useState(0);

  const dims = RATIOS.find((r) => r.id === ratio) ?? RATIOS[0];
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const getImage = useCallback((url: string) => {
    if (!url) return null;
    const cached = loaded.current.get(url);
    if (cached) return cached.complete ? cached : null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => force((n) => n + 1);
    img.onerror = () => toast.error("Could not load that image into the editor.");
    img.src = url;
    loaded.current.set(url, img);
    return null;
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, dims.w, dims.h);

    const base = getImage(baseUrl);
    if (base) {
      ctx.save();
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;
      drawCover(ctx, base, base.naturalWidth, base.naturalHeight, dims.w, dims.h, zoom);
      ctx.restore();
    }

    for (const layer of layers) {
      if (layer.kind === "rect") {
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.fillStyle = layer.color;
        ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
        ctx.restore();
      } else if (layer.kind === "image") {
        const img = getImage(layer.url);
        if (img) ctx.drawImage(img, layer.x, layer.y, layer.w, layer.h);
      } else {
        ctx.save();
        ctx.font = `${layer.weight} ${layer.size}px Inter, system-ui, sans-serif`;
        ctx.textAlign = layer.align;
        ctx.textBaseline = "top";
        const lines = layer.text.split("\n");
        const lineHeight = layer.size * 1.2;
        if (layer.bg) {
          const widths = lines.map((l) => ctx.measureText(l).width);
          const maxW = Math.max(...widths, 0);
          const pad = layer.size * 0.3;
          const bx = layer.align === "center" ? layer.x - maxW / 2 : layer.align === "right" ? layer.x - maxW : layer.x;
          ctx.fillStyle = layer.bg;
          ctx.fillRect(bx - pad, layer.y - pad, maxW + pad * 2, lineHeight * lines.length + pad * 2);
        }
        ctx.fillStyle = layer.color;
        lines.forEach((line, i) => ctx.fillText(line, layer.x, layer.y + i * lineHeight));
        ctx.restore();
      }
    }
  }, [baseUrl, bgColor, brightness, contrast, dims.h, dims.w, getImage, layers, saturate, zoom]);

  useEffect(() => { render(); });

  const update = (id: string, patch: Partial<Layer>) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)));

  const move = (id: string, dir: -1 | 1) =>
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  // Drag layers directly on the canvas
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const toCanvas = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * dims.w,
      y: ((e.clientY - rect.top) / rect.height) * dims.h,
    };
  };
  const hitTest = (x: number, y: number) => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.kind === "text") {
        const h = l.size * 1.2 * l.text.split("\n").length;
        const w = l.size * 0.6 * Math.max(...l.text.split("\n").map((s) => s.length), 1);
        const lx = l.align === "center" ? l.x - w / 2 : l.align === "right" ? l.x - w : l.x;
        if (x >= lx && x <= lx + w && y >= l.y && y <= l.y + h) return l;
      } else if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) return l;
    }
    return null;
  };

  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);
    try {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      if (!blob) throw new Error("Canvas export failed");
      const url = await uploadStudioBlob(workspaceId, blob, "studio-image.jpg");
      onExport({ url, name: "Studio image", type: "image" });
      toast.success("Image added to the ad creative");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="grid grid-cols-[260px_1fr_260px] gap-4 h-[70vh]">
      {/* Left: sources + layers */}
      <ScrollArea className="border border-border rounded-xl p-3">
        <div className="text-xs font-semibold mb-2">Background</div>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {images.map((s) => (
            <button
              key={s.url}
              onClick={() => setBaseUrl(s.url)}
              className={cn(
                "aspect-square rounded-md overflow-hidden border-2",
                baseUrl === s.url ? "border-primary" : "border-transparent",
              )}
            >
              <img src={s.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        <div className="text-xs font-semibold mb-2">Layers</div>
        <div className="space-y-1">
          {[...layers].reverse().map((l) => (
            <button
              key={l.id}
              onClick={() => setSelectedId(l.id)}
              className={cn(
                "w-full text-left text-xs px-2 py-1.5 rounded-md border truncate",
                selectedId === l.id ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              {l.kind === "text" ? `T · ${l.text.slice(0, 18) || "Text"}` : l.kind === "rect" ? "Shape" : "Image"}
            </button>
          ))}
          {layers.length === 0 && <div className="text-xs text-muted-foreground">No layers yet.</div>}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              const l: Layer = { id: uid(), kind: "text", text: "Your headline", x: dims.w / 2, y: dims.h * 0.7, size: Math.round(dims.w * 0.07), color: "#ffffff", weight: 900, align: "center", bg: null };
              setLayers((p) => [...p, l]);
              setSelectedId(l.id);
            }}
          >
            <Type className="h-3 w-3 mr-1" /> Text
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              const l: Layer = { id: uid(), kind: "rect", x: 0, y: dims.h * 0.6, w: dims.w, h: dims.h * 0.4, color: "#000000", opacity: 0.45 };
              setLayers((p) => [...p, l]);
              setSelectedId(l.id);
            }}
          >
            <Square className="h-3 w-3 mr-1" /> Shape
          </Button>
          {images.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                const src = images[1];
                const l: Layer = { id: uid(), kind: "image", url: src.url, x: dims.w * 0.05, y: dims.h * 0.05, w: dims.w * 0.25, h: dims.w * 0.25 };
                setLayers((p) => [...p, l]);
                setSelectedId(l.id);
              }}
            >
              <ImagePlus className="h-3 w-3 mr-1" /> Overlay
            </Button>
          )}
        </div>
      </ScrollArea>

      {/* Canvas */}
      <div className="flex flex-col items-center justify-center bg-muted/40 rounded-xl p-4 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full rounded-lg shadow-lg touch-none"
          style={{ aspectRatio: `${dims.w} / ${dims.h}`, height: "100%", width: "auto" }}
          onPointerDown={(e) => {
            const { x, y } = toCanvas(e);
            const hit = hitTest(x, y);
            if (hit) {
              setSelectedId(hit.id);
              dragging.current = { id: hit.id, dx: x - hit.x, dy: y - hit.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            const { x, y } = toCanvas(e);
            update(dragging.current.id, { x: x - dragging.current.dx, y: y - dragging.current.dy } as Partial<Layer>);
          }}
          onPointerUp={() => { dragging.current = null; }}
        />
      </div>

      {/* Right: properties */}
      <ScrollArea className="border border-border rounded-xl p-3">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Size</Label>
            <Select value={ratio} onValueChange={setRatio}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RATIOS.map((r) => <SelectItem key={r.id} value={r.id} className="text-xs">{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Zoom {zoom.toFixed(2)}x</Label>
            <Slider value={[zoom]} min={1} max={2.5} step={0.01} onValueChange={([v]) => setZoom(v)} className="mt-2" />
          </div>
          <div>
            <Label className="text-xs">Brightness {brightness}%</Label>
            <Slider value={[brightness]} min={40} max={160} step={1} onValueChange={([v]) => setBrightness(v)} className="mt-2" />
          </div>
          <div>
            <Label className="text-xs">Contrast {contrast}%</Label>
            <Slider value={[contrast]} min={40} max={180} step={1} onValueChange={([v]) => setContrast(v)} className="mt-2" />
          </div>
          <div>
            <Label className="text-xs">Saturation {saturate}%</Label>
            <Slider value={[saturate]} min={0} max={200} step={1} onValueChange={([v]) => setSaturate(v)} className="mt-2" />
          </div>
          <div>
            <Label className="text-xs">Canvas background</Label>
            <Input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-8 mt-1 p-1" />
          </div>

          {selected && (
            <div className="pt-3 border-t border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold capitalize">{selected.kind} layer</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(selected.id, 1)}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(selected.id, -1)}><ArrowDown className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setLayers((p) => p.filter((l) => l.id !== selected.id)); setSelectedId(null); }}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>

              {selected.kind === "text" && (
                <>
                  <Input value={selected.text} onChange={(e) => update(selected.id, { text: e.target.value } as Partial<Layer>)} className="h-8 text-xs" />
                  <div>
                    <Label className="text-xs">Font size {selected.size}px</Label>
                    <Slider value={[selected.size]} min={20} max={Math.round(dims.w * 0.2)} step={1} onValueChange={([v]) => update(selected.id, { size: v } as Partial<Layer>)} className="mt-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Color</Label>
                      <Input type="color" value={selected.color} onChange={(e) => update(selected.id, { color: e.target.value } as Partial<Layer>)} className="h-8 p-1 mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Weight</Label>
                      <Select value={String(selected.weight)} onValueChange={(v) => update(selected.id, { weight: Number(v) as 400 | 700 | 900 } as Partial<Layer>)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="400" className="text-xs">Regular</SelectItem>
                          <SelectItem value="700" className="text-xs">Bold</SelectItem>
                          <SelectItem value="900" className="text-xs">Black</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(["left", "center", "right"] as const).map((a) => (
                      <Button key={a} size="sm" variant={selected.align === a ? "default" : "outline"} className="h-7 text-[11px] capitalize" onClick={() => update(selected.id, { align: a } as Partial<Layer>)}>{a}</Button>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => update(selected.id, { bg: selected.bg ? null : "#000000" } as Partial<Layer>)}>
                    {selected.bg ? "Remove text background" : "Add text background"}
                  </Button>
                </>
              )}

              {selected.kind === "rect" && (
                <>
                  <div>
                    <Label className="text-xs">Opacity {Math.round(selected.opacity * 100)}%</Label>
                    <Slider value={[selected.opacity]} min={0} max={1} step={0.05} onValueChange={([v]) => update(selected.id, { opacity: v } as Partial<Layer>)} className="mt-2" />
                  </div>
                  <div>
                    <Label className="text-xs">Fill</Label>
                    <Input type="color" value={selected.color} onChange={(e) => update(selected.id, { color: e.target.value } as Partial<Layer>)} className="h-8 p-1 mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Width</Label>
                      <Input type="number" value={Math.round(selected.w)} onChange={(e) => update(selected.id, { w: Number(e.target.value) } as Partial<Layer>)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Height</Label>
                      <Input type="number" value={Math.round(selected.h)} onChange={(e) => update(selected.id, { h: Number(e.target.value) } as Partial<Layer>)} className="h-8 text-xs mt-1" />
                    </div>
                  </div>
                </>
              )}

              {selected.kind === "image" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Width</Label>
                    <Input type="number" value={Math.round(selected.w)} onChange={(e) => update(selected.id, { w: Number(e.target.value), h: Number(e.target.value) } as Partial<Layer>)} className="h-8 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Source</Label>
                    <Select value={selected.url} onValueChange={(v) => update(selected.id, { url: v } as Partial<Layer>)}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {images.map((im, i) => <SelectItem key={im.url} value={im.url} className="text-xs">{im.name || `Image ${i + 1}`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          <Button className="w-full mt-2" onClick={handleExport} disabled={exporting || !baseUrl}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save to ad creative
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
