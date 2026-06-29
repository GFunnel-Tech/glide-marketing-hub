import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Square, Loader2, AlertCircle, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUploadAsset, useDeleteAsset } from "../hooks/useMediaAssets";
import { ACCEPTED_VOICE_MIME, VOICE_MAX_SECONDS, VOICE_MIN_SECONDS, VOICE_RECOMMENDED_SECONDS } from "../config";
import { VOICE_SCRIPT_BODY, VOICE_SCRIPT_CONSENT_LINE } from "../voiceScript";
import type { WizardContext } from "../OnboardingWizard";

type RecordingState = "idle" | "recording" | "paused" | "stopped";

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
  return undefined;
}

export function VoiceStep({ ctx }: { ctx: WizardContext }) {
  const upload = useUploadAsset();
  const del = useDeleteAsset();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existing = ctx.assets.find((a) => a.kind === "voice");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) { setSignedUrl(null); return; }
    let cancelled = false;
    supabase.storage.from("client-onboarding")
      .createSignedUrl(existing.storage_path, 3600)
      .then(({ data }) => { if (!cancelled && data?.signedUrl) setSignedUrl(data.signedUrl); });
    return () => { cancelled = true; };
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopAll();
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAll = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickerRef.current) window.clearInterval(tickerRef.current);
    tickerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const startRecording = async () => {
    setPermissionError(null);
    setRecordingBlob(null);
    if (recordingUrl) { URL.revokeObjectURL(recordingUrl); setRecordingUrl(null); }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      setPermissionError(err?.message ?? "Microphone unavailable");
      toast.error("Microphone blocked. Use the upload fallback below.");
      return;
    }
    streamRef.current = stream;

    const mime = pickMime();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (err: any) {
      setPermissionError(err?.message ?? "Could not start recorder");
      stopAll();
      return;
    }
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      setRecordingBlob(blob);
      const url = URL.createObjectURL(blob);
      setRecordingUrl(url);
      setState("stopped");
      stopAll();
    };

    // Level meter
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ac;
    const src = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128);
        if (v > peak) peak = v;
      }
      setLevel(Math.min(1, peak / 128));
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    startedAtRef.current = Date.now();
    setElapsed(0);
    tickerRef.current = window.setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(secs);
      if (secs >= VOICE_MAX_SECONDS) {
        toast.info("Reached maximum length — stopping");
        stop();
      }
    }, 250);

    recorder.start();
    setState("recording");
  };

  const stop = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); // onstop handles cleanup
    }
  };

  const retake = () => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingBlob(null);
    setRecordingUrl(null);
    setElapsed(0);
    setState("idle");
  };

  const save = async () => {
    if (!recordingBlob) return;
    setBusy(true);
    try {
      if (elapsed < VOICE_MIN_SECONDS) {
        toast.error(`Recording is too short — need ≥ ${VOICE_MIN_SECONDS}s`);
        return;
      }
      // Replace any prior voice asset
      if (existing) {
        await del.mutateAsync(existing);
      }
      const mime = recordingBlob.type || "audio/webm";
      const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
      await upload.mutateAsync({
        clientId: ctx.clientId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        kind: "voice",
        file: recordingBlob,
        filename: `voice-${Date.now()}.${ext}`,
        mimeType: mime,
        durationSeconds: elapsed,
      });
      await ctx.refetchAssets();
      await ctx.save({ voice_done: true });
      toast.success("Voice recording saved");
      retake();
      ctx.advance();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save recording");
    } finally {
      setBusy(false);
    }
  };

  const onFallbackPick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const f = files[0];
    if (!ACCEPTED_VOICE_MIME.includes(f.type) && !f.type.startsWith("audio/")) {
      toast.error("Choose an audio file");
      return;
    }
    // Read duration via an off-DOM audio element
    let duration = 0;
    try {
      duration = await new Promise<number>((resolve, reject) => {
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        audio.onloadedmetadata = () => resolve(audio.duration || 0);
        audio.onerror = () => reject(new Error("Cannot read audio metadata"));
        audio.src = URL.createObjectURL(f);
      });
    } catch {
      toast.error("Could not read audio length");
      return;
    }
    duration = Math.round(duration);
    if (duration < VOICE_MIN_SECONDS) {
      toast.error(`Audio is only ${duration}s — need ≥ ${VOICE_MIN_SECONDS}s`);
      return;
    }
    setBusy(true);
    try {
      if (existing) await del.mutateAsync(existing);
      await upload.mutateAsync({
        clientId: ctx.clientId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        kind: "voice",
        file: f,
        filename: f.name,
        mimeType: f.type || "audio/mpeg",
        durationSeconds: duration,
      });
      await ctx.refetchAssets();
      await ctx.save({ voice_done: true });
      toast.success("Voice file uploaded");
      ctx.advance();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const existingMeetsGate = !!existing && (existing.duration_seconds ?? 0) >= VOICE_MIN_SECONDS;
  const canContinue = existingMeetsGate;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Voice recording</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Read the script below at a natural pace. Aim for {VOICE_RECOMMENDED_SECONDS}s (about 2–3 min).
          Minimum {VOICE_MIN_SECONDS}s.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Script — read aloud
        </p>
        <ScrollArea className="h-44 pr-3">
          <p className="text-sm text-foreground italic mb-3">{`(Consent line — read first, naturally) "${VOICE_SCRIPT_CONSENT_LINE}"`}</p>
          {VOICE_SCRIPT_BODY.split("\n\n").map((p, i) => (
            <p key={i} className="text-sm text-foreground mb-2 leading-relaxed">{p}</p>
          ))}
        </ScrollArea>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="text-foreground font-medium">For best results</p>
        <ul className="list-disc ml-5 space-y-0.5">
          <li>Quiet room. About 6 inches from the mic.</li>
          <li>No background music or TV. One take is fine — natural conversational pace.</li>
        </ul>
      </div>

      {existing ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              Saved recording — {Math.round(existing.duration_seconds ?? 0)}s
            </p>
            {!existingMeetsGate && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> Too short, please re-record
              </span>
            )}
          </div>
          {signedUrl ? (
            <audio controls src={signedUrl} className="w-full" />
          ) : (
            <p className="text-xs text-muted-foreground">Loading preview…</p>
          )}
          <Button size="sm" variant="outline" onClick={() => del.mutate(existing, { onSuccess: () => ctx.refetchAssets() })}>
            <RotateCcw className="h-4 w-4 mr-1" /> Re-record
          </Button>
        </div>
      ) : null}

      {!existing && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          {permissionError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
              <div>
                Microphone error: {permissionError}. Use the upload fallback below.
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            {state === "idle" && (
              <Button onClick={startRecording} variant="outline">
                <Mic className="h-4 w-4 mr-1.5" /> Start recording
              </Button>
            )}
            {state === "recording" && (
              <Button onClick={stop} variant="destructive">
                <Square className="h-4 w-4 mr-1.5" /> Stop ({elapsed}s)
              </Button>
            )}
            {state === "recording" && (
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-[hsl(var(--primary))] transition-[width]"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>
            )}
            {state === "stopped" && (
              <span className="text-sm text-muted-foreground">Recorded {elapsed}s</span>
            )}
          </div>

          {state === "recording" && elapsed < VOICE_MIN_SECONDS && (
            <p className="text-xs text-muted-foreground">
              Keep going — need at least {VOICE_MIN_SECONDS - elapsed}s more.
            </p>
          )}

          {recordingUrl && state === "stopped" && (
            <div className="space-y-2">
              <audio controls src={recordingUrl} className="w-full" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={retake}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Re-record
                </Button>
                <Button size="sm" onClick={save} disabled={busy || elapsed < VOICE_MIN_SECONDS}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save recording
                </Button>
              </div>
            </div>
          )}

          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mb-2">
              Can't use your mic? Upload an audio file instead.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => { onFallbackPick(e.target.files); e.target.value = ""; }}
            />
            <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4 mr-1" /> Upload audio file
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={ctx.back}>Back</Button>
        <Button onClick={ctx.advance} disabled={!canContinue}>Continue</Button>
      </div>
    </div>
  );
}
