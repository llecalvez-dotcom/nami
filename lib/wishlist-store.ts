"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "nami.wishlist.v1";
const DEFAULT: string[] = ["JP", "PE"];
const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cached: string[] = DEFAULT;

function read(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? (JSON.parse(raw) as string[]) : DEFAULT;
    } catch {
      cached = DEFAULT;
    }
  }
  return cached;
}

function write(list: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useWishlist(): string[] {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}

export function addWish(iso2: string) {
  const list = read();
  if (!list.includes(iso2)) write([...list, iso2]);
}

export function removeWish(iso2: string) {
  write(read().filter((c) => c !== iso2));
}
