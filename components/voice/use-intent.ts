"use client";

import { useCallback, useRef, useState } from "react";
import type { ConversationItem } from "@/lib/trip-state";
import { readSpokenLanguage } from "@/lib/voice/language";
import { INTENT_TIMEOUT_MS, IntentSchema, questionFromItem, quickIntent, type Intent } from "@/lib/voice/intent";

// What the traveller meant: the closed word lists first (0 ms), then /api/voice/intent (the H model, 4 s at most).
// Any failure is "free": the transcript goes on as it did before.
export type UseIntent = { interpret: (item: ConversationItem, transcript: string) => Promise<Intent>; thinking: boolean };

export async function requestIntent(item: ConversationItem, transcript: string, fetcher: typeof fetch = fetch): Promise<Intent> {
  const question = questionFromItem(item);
  const free: Intent = { kind: "free", text: transcript, confidence: 0 };
  if (!question) return free;
  const quick = quickIntent({ transcript, question });
  if (quick) return quick;
  try {
    const response = await fetcher("/api/voice/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, language: readSpokenLanguage(), question }),
      signal: AbortSignal.timeout(INTENT_TIMEOUT_MS + 1_000),
    });
    if (!response.ok) return free;
    const parsed = IntentSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : free;
  } catch {
    return free;
  }
}

export function useIntent(): UseIntent {
  const [thinking, setThinking] = useState(false);
  const pending = useRef(0);
  const interpret = useCallback(async (item: ConversationItem, transcript: string) => {
    pending.current += 1;
    setThinking(true);
    try {
      return await requestIntent(item, transcript);
    } finally {
      pending.current -= 1;
      if (pending.current === 0) setThinking(false);
    }
  }, []);
  return { interpret, thinking };
}
