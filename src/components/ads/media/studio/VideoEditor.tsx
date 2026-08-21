import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, Trash2, Type, Loader2, Plus, Scissors, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { RATIOS, drawCover, uploadStudioBlob } from "./uploadBlob";
import type { StudioSource } from "./ImageEditor";
import { cn } from "@/lib/utils";

interface Clip {
  id: string;
  url: string;
  name: string;
  kind: "video" | "image";
  duration: number; // natural duration (images: chosen still duration)
  trimStart: number;
  trimEnd: number;
  transition: "none" | "fade";
}

interface Overlay {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  size: number;
  color: string;
  align: "left" | "center" | "right";
}

interface Props {
  workspaceId: string;
  sources: StudioSource[];
  onExport: (asset: { url: string; name: string; type: "video" }) => void;
}

const uid = () => crypto.randomUUID();
const clipLen = (c: Clip) => Math.max(0.1, c.trimEnd - c.trimStart);
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 10))}`;

export function VideoEditor({ workspaceId, sources, onExport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoEls = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageEls = useRef<Map<string, HTMLImageElement>>(new Map());
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const playheadRef = useRef(0);
  const lastTick = useRef(0);

  const [ratio, setRatio] = useState("9:16");
  const [clips, setClips] = useState<Clip[]>([]);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioVolume, setAudioVolume] = useState(0.6);
  const [muteClips, setMuteClips] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const dims = RATIOS.find((r) => r.id === ratio) ?? RATIOS[2];
  const total = useMemo(() => clips.reduce((s, c) => s + clipLen(c), 0), [clips]);
  const overlay = overlays.find((o) => o.id === selectedOverlay) ?? null;

  const getVideo = useCallback((url: string) => {
    let el = videoEls.current.get(url);
    if (!el) {
      el = document.createElement("video");
      el.crossOrigin = "anonymous";
      el.src = url;
      el.preload = "auto";
      el.playsInline = true;
      videoEls.current.set(url, el);
    }
    return el;
  }, []);

  const getImg = useCallback((url: string) => {
    let el = imageEls.current.get(url);
    if (!el) {
      el = new Image();
      el.crossOrigin = "anonymous";
      el.src = url;
      imageEls.current.set(url, el);
    }
    return el;
  }, []);

  // Seed the timeline from the picked sources
  useEffect(() => {
    if (clips.length) return;
    const seeded: Clip[] = sources.map((s) => ({
      id: uid(),
      url: s.url,
      name: s.name || (s.type === "video" ? "Clip" : "Still"),
      kind: s.type,
      duration: s.type === "image" ? 3 : 5,
      trimStart: 0,
      trimEnd: s.type === "image" ? 3 : 5,
      transition: "fade",
    }));
    setClips(seeded);
    seeded.forEach((c) => {
      if (c.kind !== "video") return;
      const el = getVideo(c.url);
      const apply = () => {
        const d = el.duration;
        if (!isFinite(d) || d <= 0) return;
        setClips((prev) => prev.map((x) => (x.id === c.id ? { ...x, duration: d, trimEnd: Math.min(d, 15) } : x)));
      };
      if (el.readyState >= 1) apply();
      else el.addEventListener("loadedmetadata", apply, { once: true });
    });
  }, [sources, clips.length, getVideo]);

  const clipAt = useCallback(
    (t: number) => {
      let acc = 0;
      for (const c of clips) {
        const len = clipLen(c);
        if (t < acc + len) return { clip: c, local: t - acc, len, offset: acc };
        acc += len;
      }
      const last = clips[clips.length - 1];
      return last ? { clip: last, local: clipLen(last), len: clipLen(last), offset: acc - clipLen(last) } : null;
    },
    [clips],
  );

  const drawFrame = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = dims.w;
      canvas.height = dims.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, dims.w, dims.h);

      const at = clipAt(t);
      if (at) {
        const { clip, local, len } = at;
        if (clip.kind === "video") {
          const el = getVideo(clip.url);
          if (el.videoWidth) drawCover(ctx, el, el.videoWidth, el.videoHeight, dims.w, dims.h);
        } else {
          const img = getImg(clip.url);
          if (img.complete && img.naturalWidth) drawCover(ctx, img, img.naturalWidth, img.naturalHeight, dims.w, dims.h);
        }
        if (clip.transition === "fade") {
          const fade = 0.4;
          const alpha = Math.min(1, Math.min(local, Math.max(0, len - local)) / fade);
          if (alpha < 1) {
            ctx.save();
            ctx.globalAlpha = 1 - alpha;
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, dims.w, dims.h);
            ctx.restore();
          }
        }
      }

      for (const o of overlays) {
        if (t < o.start || t > o.end) continue;
        ctx.save();
        ctx.font = `900 ${o.size}px Inter, system-ui, sans-serif`;
        ctx.textAlign = o.align;
        ctx.textBaseline = "top";
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = o.size * 0.25;
        ctx.fillStyle = o.color;
        o.text.split("\n").forEach((line, i) => ctx.fillText(line, o.x, o.y + i * o.size * 1.2));
        ctx.restore();
      }
    },
    [clipAt, dims.h, dims.w, getImg, getVideo, overlays],
  );

  // Keep the preview in sync while scrubbing
  useEffect(() => {
    if (!playing) {
      const at = clipAt(playhead);
      if (at?.clip.kind === "video") {
        const el = getVideo(at.clip.url);
        const target = at.clip.trimStart + at.local;
        if (Math.abs(el.currentTime - target) > 0.15) el.currentTime = target;
        el.pause();
      }
      const id = window.setTimeout(() => drawFrame(playhead), 60);
      drawFrame(playhead);
      return () => window.clearTimeout(id);
    }
  }, [playhead, playing, clipAt, drawFrame, getVideo]);

  const stopAll = useCallback(() => {
    videoEls.current.forEach((v) => v.pause());
    audioEl.current?.pause();
  }, []);

  // Playback loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopAll();
      return;
    }
    playheadRef.current = playhead >= total - 0.05 ? 0 : playhead;
    lastTick.current = performance.now();

    if (audioUrl) {
      if (!audioEl.current) {
        audioEl.current = new Audio(audioUrl);
        audioEl.current.crossOrigin = "anonymous";
      }
      audioEl.current.src = audioUrl;
      audioEl.current.volume = audioVolume;
      audioEl.current.currentTime = Math.min(playheadRef.current, 0);
      void audioEl.current.play().catch(() => {});
    }

    const tick = () => {
      const now = performance.now();
      const dt = (now - lastTick.current) / 1000;
      lastTick.current = now;
      playheadRef.current = Math.min(total, playheadRef.current + dt);
      const at = clipAt(playheadRef.current);
      if (at) {
        videoEls.current.forEach((v, url) => { if (url !== at.clip.url) v.pause(); });
        if (at.clip.kind === "video") {
          const el = getVideo(at.clip.url);
          el.muted = muteClips;
          const target = at.clip.trimStart + at.local;
          if (Math.abs(el.currentTime - target) > 0.35) el.currentTime = target;
          if (el.paused) void el.play().catch(() => {});
        }
      }
      drawFrame(playheadRef.current);
      setPlayhead(playheadRef.current);
      if (playheadRef.current >= total) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total, audioUrl]);

  const patchClip = (id: string, patch: Partial<Clip>) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addStills = () => {
    const stills = sources.filter((s) => s.type === "image");
    if (!stills.length) return toast.info("Pick an image in the media library first.");
    setClips((prev) => [
      ...prev,
      ...stills.map((s) => ({ id: uid(), url: s.url, name: s.name || "Still", kind: "image" as const, duration: 3, trimStart: 0, trimEnd: 3, transition: "fade" as const })),
    ]);
  };

  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !clips.length) return;
    setExporting(true);
    setExportProgress(0);
    setPlaying(false);
    try {
      drawFrame(0);
      const stream = canvas.captureStream(30);
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      let hasAudio = false;

      if (!muteClips) {
        for (const c of clips) {
          if (c.kind !== "video") continue;
          const el = getVideo(c.url);
          try {
            const src = audioCtx.createMediaElementSource(el);
            src.connect(dest);
            hasAudio = true;
          } catch { /* already connected */ }
        }
      }
      let music: HTMLAudioElement | null = null;
      if (audioUrl) {
        music = new Audio(audioUrl);
        music.crossOrigin = "anonymous";
        try {
          const src = audioCtx.createMediaElementSource(music);
          const gain = audioCtx.createGain();
          gain.gain.value = audioVolume;
          src.connect(gain).connect(dest);
          hasAudio = true;
        } catch { /* ignore */ }
      }
      if (hasAudio) dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      });

      recorder.start(200);
      if (music) void music.play().catch(() => {});
      await audioCtx.resume().catch(() => {});

      // Real-time render pass
      let t = 0;
      let last = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          const now = performance.now();
          t += (now - last) / 1000;
          last = now;
          const at = clipAt(t);
          if (at) {
            videoEls.current.forEach((v, url) => { if (url !== at.clip.url) v.pause(); });
            if (at.clip.kind === "video") {
              const el = getVideo(at.clip.url);
              el.muted = muteClips;
              const target = at.clip.trimStart + at.local;
              if (Math.abs(el.currentTime - target) > 0.35) el.currentTime = target;
              if (el.paused) void el.play().catch(() => {});
            }
          }
          drawFrame(Math.min(t, total));
          setExportProgress(Math.min(100, Math.round((t / total) * 100)));
          if (t >= total) { resolve(); return; }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      stopAll();
      music?.pause();
      recorder.stop();
      const blob = await done;
      await audioCtx.close().catch(() => {});

      const url = await uploadStudioBlob(workspaceId, blob, "studio-video.webm");
      onExport({ url, name: "Studio video", type: "video" });
      toast.success("Video added to the ad creative");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4 h-[70vh]">
      <div className="flex flex-col gap-3 min-h-0">
        <div className="flex-1 flex items-center justify-center bg-muted/40 rounded-xl overflow-hidden p-3">
          <canvas ref={canvasRef} className="max-h-full max-w-full rounded-lg shadow-lg" style={{ aspectRatio: `${dims.w} / ${dims.h}`, height: "100%", width: "auto" }} />
        </div>

        {/* Transport */}
        <div className="flex items-center gap-3">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPlaying((p) => !p)} disabled={!clips.length || exporting}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Slider value={[playhead]} min={0} max={Math.max(total, 0.1)} step={0.05} onValueChange={([v]) => { setPlaying(false); setPlayhead(v); }} className="flex-1" />
          <span className="text-xs tabular-nums text-muted-foreground w-24 text-right">{fmt(playhead)} / {fmt(total)}</span>
        </div>

        {/* Timeline */}
        <ScrollArea className="border border-border rounded-xl p-2 h-[150px]">
          <div className="flex gap-2">
            {clips.map((c, i) => (
              <div key={c.id} className="w-44 shrink-0 rounded-lg border border-border p-2 space-y-1.5 bg-card">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium truncate">{i + 1}. {c.name}</span>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setClips((p) => p.filter((x) => x.id !== c.id))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                <div className="h-10 rounded bg-muted overflow-hidden">
                  {c.kind === "image" ? <img src={c.url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">{c.duration.toFixed(1)}s clip</div>}
                </div>
                {c.kind === "video" ? (
                  <>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Scissors className="h-3 w-3" /> {c.trimStart.toFixed(1)}s – {c.trimEnd.toFixed(1)}s</div>
                    <Slider value={[c.trimStart, c.trimEnd]} min={0} max={Math.max(c.duration, 0.2)} step={0.1}
                      onValueChange={([a, b]) => patchClip(c.id, { trimStart: Math.min(a, b - 0.2), trimEnd: Math.max(b, a + 0.2) })} />
                  </>
                ) : (
                  <>
                    <div className="text-[10px] text-muted-foreground">Duration {clipLen(c).toFixed(1)}s</div>
                    <Slider value={[clipLen(c)]} min={1} max={10} step={0.5} onValueChange={([v]) => patchClip(c.id, { trimStart: 0, trimEnd: v, duration: v })} />
                  </>
                )}
                <Select value={c.transition} onValueChange={(v) => patchClip(c.id, { transition: v as Clip["transition"] })}>
                  <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">Hard cut</SelectItem>
                    <SelectItem value="fade" className="text-xs">Fade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
            <button onClick={addStills} className="w-32 shrink-0 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-xs text-muted-foreground hover:border-primary hover:text-primary">
              <Plus className="h-4 w-4 mb-1" /> Add stills
            </button>
          </div>
        </ScrollArea>
      </div>

      {/* Right panel */}
      <ScrollArea className="border border-border rounded-xl p-3">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Aspect ratio</Label>
            <Select value={ratio} onValueChange={setRatio}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RATIOS.map((r) => <SelectItem key={r.id} value={r.id} className="text-xs">{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Text overlays</span>
              <Button size="sm" variant="outline" className="h-6 text-[11px]"
                onClick={() => {
                  const o: Overlay = { id: uid(), text: "Your hook", start: 0, end: Math.min(3, total || 3), x: dims.w / 2, y: dims.h * 0.12, size: Math.round(dims.w * 0.08), color: "#ffffff", align: "center" };
                  setOverlays((p) => [...p, o]);
                  setSelectedOverlay(o.id);
                }}>
                <Type className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-1">
              {overlays.map((o) => (
                <button key={o.id} onClick={() => setSelectedOverlay(o.id)}
                  className={cn("w-full text-left text-xs px-2 py-1.5 rounded-md border truncate", selectedOverlay === o.id ? "border-primary bg-primary/5" : "border-border")}>
                  {o.text.slice(0, 20) || "Text"} · {o.start.toFixed(1)}–{o.end.toFixed(1)}s
                </button>
              ))}
            </div>
          </div>

          {overlay && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Input value={overlay.text} onChange={(e) => setOverlays((p) => p.map((o) => (o.id === overlay.id ? { ...o, text: e.target.value } : o)))} className="h-8 text-xs" />
              <Label className="text-xs">Visible {overlay.start.toFixed(1)}s – {overlay.end.toFixed(1)}s</Label>
              <Slider value={[overlay.start, overlay.end]} min={0} max={Math.max(total, 1)} step={0.1}
                onValueChange={([a, b]) => setOverlays((p) => p.map((o) => (o.id === overlay.id ? { ...o, start: Math.min(a, b - 0.2), end: Math.max(b, a + 0.2) } : o)))} />
              <Label className="text-xs">Size {overlay.size}px</Label>
              <Slider value={[overlay.size]} min={24} max={Math.round(dims.w * 0.2)} step={2}
                onValueChange={([v]) => setOverlays((p) => p.map((o) => (o.id === overlay.id ? { ...o, size: v } : o)))} />
              <Label className="text-xs">Vertical position</Label>
              <Slider value={[overlay.y]} min={0} max={dims.h - 40} step={10}
                onValueChange={([v]) => setOverlays((p) => p.map((o) => (o.id === overlay.id ? { ...o, y: v } : o)))} />
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <Label className="text-xs">Color</Label>
                  <Input type="color" value={overlay.color} onChange={(e) => setOverlays((p) => p.map((o) => (o.id === overlay.id ? { ...o, color: e.target.value } : o)))} className="h-8 p-1 mt-1" />
                </div>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setOverlays((p) => p.filter((o) => o.id !== overlay.id)); setSelectedOverlay(null); }}>
                  <Trash2 className="h-3 w-3 mr-1 text-destructive" /> Remove
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border space-y-2">
            <Label className="text-xs flex items-center gap-1"><Volume2 className="h-3 w-3" /> Music track URL</Label>
            <Input value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="https://…/track.mp3" className="h-8 text-xs" />
            <Label className="text-xs">Music volume {Math.round(audioVolume * 100)}%</Label>
            <Slider value={[audioVolume]} min={0} max={1} step={0.05} onValueChange={([v]) => setAudioVolume(v)} />
            <Button size="sm" variant={muteClips ? "default" : "outline"} className="h-7 text-xs w-full" onClick={() => setMuteClips((m) => !m)}>
              {muteClips ? "Clip audio muted" : "Mute clip audio"}
            </Button>
          </div>

          <Button className="w-full" onClick={handleExport} disabled={exporting || !clips.length}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {exporting ? `Rendering ${exportProgress}%` : "Render & save to ad"}
          </Button>
          <p className="text-[11px] text-muted-foreground">Rendering plays the timeline through once in real time — keep this tab in the foreground.</p>
        </div>
      </ScrollArea>
    </div>
  );
}
