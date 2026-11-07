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

function browserEngine(): SpeechEngine {
  let utterance: SpeechSynthesisUtterance | null = null;
  return {
    speak(text, done) {
      // Kept in a variable: Chrome drops onend when the utterance is garbage collected.
      utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = speechLocale(readSpokenLanguage());
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    },
    cancel() {
      utterance = null;
      window.speechSynthesis.cancel();
    },
  };
}

function getQueue(): SpeechQueue | null {
  if (queue !== undefined) return queue;
  if (typeof window === "undefined") return null;
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
