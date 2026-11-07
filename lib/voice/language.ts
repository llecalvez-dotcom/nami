"use client";

import { useSyncExternalStore } from "react";

// The language the traveller last spoke in (detected by Gladia): Nami answers and reads aloud in it. English by default.

const KEY = "nami.voice.language";
const listeners = new Set<() => void>();

export function readSpokenLanguage(): string {
  try {
    return localStorage.getItem(KEY) ?? "en";
  } catch {
    return "en";
  }
}

export function setSpokenLanguage(language: string | null | undefined) {
  if (!language || !/^[a-z]{2,3}$/.test(language) || language === readSpokenLanguage()) return;
  try {
    localStorage.setItem(KEY, language);
  } catch {}
  listeners.forEach((listener) => listener());
}

// Back to English until the traveller speaks again (a new trip starts from zero).
export function resetSpokenLanguage() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((listener) => listener());
}

// Gladia guesses the language of a short answer badly ("oui", "ok", a word through a distant microphone): measured on
// 2026-11-07, Nami switched to a language the traveller does not speak. Only a sentence of 3 words or more changes it.
export const MIN_WORDS_FOR_LANGUAGE = 3;

export function languageToKeep(transcript: string, detected: string | null | undefined): string | null {
  const words = transcript.trim().split(/\s+/).filter((word) => /\p{L}/u.test(word));
  return words.length >= MIN_WORDS_FOR_LANGUAGE ? (detected ?? null) : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSpokenLanguage(): string {
  return useSyncExternalStore(subscribe, readSpokenLanguage, () => "en");
}

const LOCALES: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  nl: "nl-NL",
  id: "id-ID",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
  ar: "ar-SA",
  ru: "ru-RU",
};

// The browser voice for a language code ("fr" → "fr-FR"); the browser picks its own region for the others.
export function speechLocale(language: string): string {
  return LOCALES[language] ?? language;
}
