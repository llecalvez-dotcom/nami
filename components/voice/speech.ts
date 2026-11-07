"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { alreadyHeard, awaitsAnswer, speechPlan } from "@/lib/voice/conversation-speech";
import { createSpeechQueue, type SpeechEngine, type SpeechQueue } from "@/lib/voice/speech-queue";
import type { ConversationItem } from "@/lib/trip-state";
import { readSpokenLanguage, speechLocale } from "@/lib/voice/language";

const MUTE_KEY = "nami.voice.muted";
const muteListeners = new Set<() => void>();
let queue: SpeechQueue | null | undefined;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

// The longest a line may take before the queue moves on: Chrome sometimes never fires onend nor onerror (a line
// started before any click, a voice still loading, a paused synthesis), and the whole queue then stayed silent.
export function speechWatchdogMs(text: string): number {
  return 3_000 + text.length * 90;
}

function browserEngine(): SpeechEngine {
  let utterance: SpeechSynthesisUtterance | null = null;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  return {
    speak(text, done) {
      const synth = window.speechSynthesis;
      let finished = false;
      let started = false;
      const finish = (spoken: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        done(spoken);
      };
      // Kept in a variable: Chrome drops onend when the utterance is garbage collected.
      utterance = new SpeechSynthesisUtterance(text);
      const locale = speechLocale(readSpokenLanguage());
      utterance.lang = locale;
      const voices = synth.getVoices();
      const voice = voices.find((v) => v.lang === locale) ?? voices.find((v) => v.lang.startsWith(locale.slice(0, 2)));
      if (voice) utterance.voice = voice;
      utterance.onstart = () => {
        started = true;
      };
      utterance.onend = () => finish(started);
      utterance.onerror = () => finish(false);
      if (synth.paused) synth.resume();
      synth.speak(utterance);
      watchdog = setTimeout(() => finish(false), speechWatchdogMs(text));
    },
    cancel() {
      clearTimeout(watchdog);
      utterance = null;
      window.speechSynthesis.cancel();
    },
  };
}

// Chrome refuses speechSynthesis.speak() ("not-allowed") in a frame without a user gesture, as in the side panel's
// iframe (measured on 2026-11-07). The first click or key press in Nami speaks a silent line, which unlocks the voice.
function unlockOnFirstGesture() {
  const unlock = () => {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

function getQueue(): SpeechQueue | null {
  if (queue !== undefined) return queue;
  if (typeof window === "undefined") return null;
  if ("speechSynthesis" in window) unlockOnFirstGesture();
  queue = "speechSynthesis" in window ? createSpeechQueue(browserEngine(), readMuted()) : null;
  return queue;
}

// Reads one line that is not a conversation item (the agent's progress): it never opens a card's microphone.
export function speakLine(id: string, text: string) {
  getQueue()?.enqueue(id, text);
}

export function stopSpeaking() {
  getQueue()?.clear();
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {}
  getQueue()?.setMuted(muted);
  muteListeners.forEach((listener) => listener());
}

function subscribeMuted(listener: () => void) {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, readMuted, () => false);
}

// Reads aloud every new item from Nami or the agent, one at a time, in order.
export function useConversationSpeech(items: ConversationItem[]) {
  const heard = useRef<Set<string> | null>(null);
  const awaiting = useRef<Set<string>>(new Set());

  useEffect(
    () => () => {
      heard.current = null;
      getQueue()?.clear();
    },
    [],
  );

  useEffect(() => {
    const speech = getQueue();
    heard.current ??= alreadyHeard(items);
    const plan = speechPlan(items, heard.current, awaiting.current);
    if (plan.interrupted) speech?.clear();
    for (const { id, text } of plan.toRead) speech?.enqueue(id, text);
    items.forEach((item) => heard.current!.add(item.id));
    awaiting.current = new Set(items.filter(awaitsAnswer).map((item) => item.id));
  }, [items]);
}

// Opens the microphone of a card once Nami has finished reading that card aloud.
export function useListenAfterSpeech(itemId: string, start: () => void | Promise<void>) {
  useEffect(() => getQueue()?.onSpoken((id) => id === itemId && void start()), [itemId, start]);
}
