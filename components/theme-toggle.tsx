"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type Theme = "day" | "night";
const KEY = "nami.theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "night" ? "night" : "day"),
    () => "day",
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next: Theme = theme === "night" ? "day" : "night";
  return (
    <button
      type="button"
      aria-label={next === "night" ? "Switch to night" : "Switch to day"}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(KEY, next);
        } catch {}
      }}
      className={cn("grid size-11 place-items-center rounded-full text-[var(--icon)] transition-colors", className)}
    >
      {theme === "night" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

export const THEME_INIT = `try{var t=localStorage.getItem("${KEY}");if(t==="night"||t==="day")document.documentElement.dataset.theme=t}catch(e){}`;
