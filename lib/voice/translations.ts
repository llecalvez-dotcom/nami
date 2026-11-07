"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ConversationItem } from "@/lib/trip-state";

// Nami's English texts, translated once per language by /api/translate and kept in this browser.
// A text whose translation failed is shown and read in English rather than not at all.

type Entry = { done: Map<string, string>; failed: Set<string>; inflight: Set<string> };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
const BATCH = 40;

function storageKey(language: string) {
  return `nami.translations.${language}`;
}

function entry(language: string): Entry {
  let found = entries.get(language);
  if (!found) {
    let saved: Record<string, string> = {};
    try {
      saved = JSON.parse(localStorage.getItem(storageKey(language)) ?? "{}") as Record<string, string>;
    } catch {}
    found = { done: new Map(Object.entries(saved)), failed: new Set(), inflight: new Set() };
    entries.set(language, found);
  }
  return found;
}

function changed(language: string) {
  try {
    localStorage.setItem(storageKey(language), JSON.stringify(Object.fromEntries(entry(language).done)));
  } catch {}
  version++;
  listeners.forEach((listener) => listener());
}

// The translation, the English text when translating failed, or null while it is on its way.
export function translated(language: string, text: string): string | null {
  if (language === "en" || !text.trim()) return text;
  const { done, failed } = entry(language);
  return done.get(text) ?? (failed.has(text) ? text : null);
}

export async function requestTranslations(language: string, texts: string[]) {
  if (language === "en") return;
  const current = entry(language);
  const missing = [...new Set(texts)].filter((t) => t.trim() && !current.done.has(t) && !current.failed.has(t) && !current.inflight.has(t));
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    batch.forEach((t) => current.inflight.add(t));
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, texts: batch }),
      });
      const body = (await response.json()) as { translations?: string[] };
      if (!response.ok || body.translations?.length !== batch.length) throw new Error();
      batch.forEach((t, j) => current.done.set(t, body.translations![j]));
    } catch {
      batch.forEach((t) => current.failed.add(t));
    } finally {
      batch.forEach((t) => current.inflight.delete(t));
      changed(language);
    }
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTranslationsVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

export function itemTexts(item: ConversationItem): string[] {
  switch (item.kind) {
    case "user":
      return [];
    case "agent":
      return [item.text];
    case "agent_question":
      return [item.question];
    case "question":
      return [item.question, ...item.options.map((o) => o.label)];
    case "proposal":
      return [item.text, item.accept_label, item.decline_label];
  }
}

// The item in the language, or null while one of its texts is still being translated.
export function translateItem(item: ConversationItem, language: string): ConversationItem | null {
  const t = (text: string) => translated(language, text);
  if (itemTexts(item).some((text) => t(text) === null)) return null;
  switch (item.kind) {
    case "user":
      return item;
    case "agent":
      return { ...item, text: t(item.text)! };
    case "agent_question":
      return { ...item, question: t(item.question)! };
    case "question":
      return { ...item, question: t(item.question)!, options: item.options.map((o) => ({ ...o, label: t(o.label)! })) };
    case "proposal":
      return { ...item, text: t(item.text)!, accept_label: t(item.accept_label)!, decline_label: t(item.decline_label)! };
  }
}

// The conversation in the traveller's language, in order: it stops at the first item still being translated.
export function useTranslatedConversation(items: ConversationItem[], language: string): ConversationItem[] {
  useTranslationsVersion();
  useEffect(() => {
    void requestTranslations(language, items.flatMap(itemTexts));
  }, [items, language]);
  const shown: ConversationItem[] = [];
  for (const item of items) {
    const done = translateItem(item, language);
    if (!done) break;
    shown.push(done);
  }
  return shown;
}
