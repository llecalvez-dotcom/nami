"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_RECORDING_SECONDS, type VoiceInput } from "@/components/voice/use-voice-input";

const LABELS = {
  idle: "Speak (click again to stop)",
  recording: "Stop recording",
  transcribing: "Transcribing",
} as const;

export function MicButton({ voice, className }: { voice: VoiceInput; className?: string }) {
  const { status, seconds } = voice;
  return (
    <button
      type="button"
      onClick={voice.toggle}
      disabled={status === "transcribing"}
      aria-label={LABELS[status]}
      aria-pressed={status === "recording"}
      title={status === "recording" ? `Recording, ${MAX_RECORDING_SECONDS - seconds} s left. Click to stop.` : LABELS[status]}
      className={cn(
        "relative flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-accent text-accent-foreground transition-colors outline-none hover:bg-primary hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70",
        status === "recording" && "bg-attention text-white hover:bg-attention",
        className,
      )}
    >
      {status === "recording" ? (
        <>
          <span aria-hidden className="absolute inset-2 animate-ping rounded-[inherit] bg-attention/15" />
          <Square className="relative size-4 fill-current" />
        </>
      ) : status === "transcribing" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Mic className="size-4" />
      )}
      <span role="status" className="relative text-[8px] leading-none">
        {status === "recording" ? "Listening…" : status === "transcribing" ? "Reading…" : "Speak"}
      </span>
    </button>
  );
}

export function VoiceStatusLine({ voice, className }: { voice: VoiceInput; className?: string }) {
  const text =
    voice.status === "recording"
      ? `Listening… 0:${String(voice.seconds).padStart(2, "0")} / 0:${MAX_RECORDING_SECONDS}. Pause or click to stop.`
      : voice.status === "transcribing"
        ? "Transcribing…"
        : voice.error;
  if (!text) return null;
  return (
    <p
      role={voice.error && voice.status === "idle" ? "alert" : "status"}
      className={cn("text-sm", voice.error && voice.status === "idle" ? "text-attention-foreground" : "text-muted-foreground", className)}
    >
      {voice.status === "recording" ? <span aria-hidden className="mr-2 inline-block size-2 animate-pulse rounded-full bg-attention" /> : null}
      {text}
    </p>
  );
}
