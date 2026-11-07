"use client";

import { useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Demo settings (?demo=1): kept in this browser's localStorage only, never in the code.
export type AgentSettings = { local_session_id: string; files: string };

const STORAGE_KEY = "nami.agent-settings.v1";
const EMPTY: AgentSettings = { local_session_id: "", files: "" };
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: AgentSettings = EMPTY;

export function readAgentSettings(): AgentSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<AgentSettings>) } : EMPTY;
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

function writeAgentSettings(settings: AgentSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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

export function useAgentSettings(): AgentSettings {
  return useSyncExternalStore(subscribe, readAgentSettings, () => EMPTY);
}

export function filePaths(files: string): string[] {
  return files
    .split(/[\n,]/)
    .map((f) => f.trim())
    .filter(Boolean);
}

export function AgentSettingsCard() {
  const settings = useAgentSettings();
  return (
    <section className="space-y-3 rounded-2xl border border-dashed bg-card p-5">
      <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">Demo settings</p>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Local browser session</span>
        <Input
          value={settings.local_session_id}
          autoComplete="off"
          placeholder="Id printed by holo local browser"
          aria-label="Local browser session"
          onChange={(e) => writeAgentSettings({ ...settings, local_session_id: e.target.value })}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Files (one path per line, on this laptop)</span>
        <Textarea
          value={settings.files}
          autoComplete="off"
          rows={2}
          placeholder={"/Users/you/nami/private/passeport.jpg\n/Users/you/nami/private/photo.jpg"}
          aria-label="Files"
          onChange={(e) => writeAgentSettings({ ...settings, files: e.target.value })}
        />
      </label>
      <p className="text-xs text-muted-foreground">Stored in this browser only. The agent uploads these files on the official site.</p>
    </section>
  );
}
