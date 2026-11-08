"use client";

import { useSyncExternalStore } from "react";
import { Keyboard, Mic } from "lucide-react";
import { readAnswerMode, writeAnswerMode, type AnswerMode } from "@/lib/voice/answer-mode";
import { cn } from "@/lib/utils";

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function setAnswerMode(mode: AnswerMode) {
  writeAnswerMode(mode);
  listeners.forEach((listener) => listener());
}

export function useAnswerMode(): AnswerMode {
  return useSyncExternalStore(subscribe, () => readAnswerMode(), () => "voice");
}

export const ANSWER_MODE_TEXTS = ["Voice", "Typing", "Switch to typing", "Switch to voice"];

// Next to the mute toggle: one tap and Nami waits for typed answers instead of opening the microphone. Mute (Nami's
// own voice) stays a separate control.
export function AnswerModeToggle({ className, t = (text) => text }: { className?: string; t?: (text: string) => string }) {
  const mode = useAnswerMode();
  const typing = mode === "typing";
  return (
    <button
      type="button"
      aria-label={typing ? t("Switch to voice") : t("Switch to typing")}
      aria-pressed={typing}
      title={typing ? `${t("Typing")}. ${t("Switch to voice")}` : `${t("Voice")}. ${t("Switch to typing")}`}
      data-answer-mode={mode}
      onClick={() => setAnswerMode(typing ? "voice" : "typing")}
      className={cn("np-press grid size-11 place-items-center rounded-full text-[var(--icon)] transition-colors", className)}
    >
      {typing ? <Keyboard className="size-5" /> : <Mic className="size-5" />}
    </button>
  );
}
