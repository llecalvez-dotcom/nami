"use client";

import type { ReactNode } from "react";

export type WaveState = "idle" | "speaking" | "listening" | "working";

// One swell repeated twice across a 200% wide drawing, so drifting by half its width loops without a seam.
const SWELL =
  "M0 40 C 50 20, 100 20, 150 40 S 250 60, 300 40 S 400 20, 450 40 S 550 60, 600 40 S 700 20, 750 40 S 850 60, 900 40 S 1000 20, 1050 40 S 1150 60, 1200 40 V 80 H 0 Z";

function Swell({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden>
      <path d={SWELL} fill="currentColor" />
    </svg>
  );
}

// Nami's signature: calm at rest, it swells when Nami speaks, rises when Nami listens, rolls on while the agent works.
export function Wave({ state, children }: { state: WaveState; children?: ReactNode }) {
  return (
    <div className="np-wave" data-state={state}>
      <div className="np-swells">
        <Swell className="np-swell-back" />
        <Swell className="np-swell-front" />
      </div>
      {children ? <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center">{children}</div> : null}
    </div>
  );
}
