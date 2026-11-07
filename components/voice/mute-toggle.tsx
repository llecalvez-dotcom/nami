"use client";

import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { setMuted, useMuted } from "@/components/voice/speech";

export function MuteToggle({ className }: { className?: string }) {
  const muted = useMuted();
  return (
    <button
      type="button"
      aria-label={muted ? "Unmute Nami" : "Mute Nami"}
      aria-pressed={muted}
      title={muted ? "Unmute: Nami reads aloud again" : "Mute: Nami stops reading aloud"}
      onClick={() => setMuted(!muted)}
      className={cn("grid size-11 place-items-center rounded-full text-[var(--icon)] transition-colors", className)}
    >
      {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
    </button>
  );
}
