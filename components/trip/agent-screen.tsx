"use client";

import { useEffect, useState } from "react";

export function AgentScreen({ sessionId, active, demo }: { sessionId: string; active: boolean; demo: boolean }) {
  const [open, setOpen] = useState(false);
  const [blurred, setBlurred] = useState(demo);
  const [refresh, setRefresh] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!open || !active) return;
    const timer = setInterval(() => setRefresh(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [open, active]);

  return (
    <details className="mt-4 rounded-xl border border-white/15 p-3" onToggle={(event) => {
      setOpen(event.currentTarget.open);
      if (event.currentTarget.open) {
        setRefresh(Date.now());
        if (demo) setBlurred(true);
      }
    }}>
      <summary className="cursor-pointer text-sm">Show the agent&apos;s screen</summary>
      {open ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-background/60">Private preview. May contain passport details. Not saved to your trip.</p>
          {unavailable ? <p className="text-sm" role="status">The agent&apos;s screen is not available yet.</p> : null}
          <button type="button" className="block w-full overflow-hidden rounded-lg text-left" onClick={() => setBlurred(!blurred)}
            aria-label={blurred ? "Reveal passport details on the agent's screen" : "Blur the agent's screen"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/agent/${encodeURIComponent(sessionId)}/screen?t=${refresh}&active=${active ? "1" : "0"}`}
              alt="The agent's latest screen" referrerPolicy="no-referrer"
              className={`max-h-[480px] w-full object-contain ${blurred ? "blur-xl" : ""} ${unavailable ? "hidden" : ""}`}
              onLoad={() => setUnavailable(false)} onError={() => setUnavailable(true)} />
          </button>
          {!unavailable ? <p className="text-xs text-background/60">{blurred ? "Click the screen to reveal details." : "Click the screen to blur details."}</p> : null}
        </div>
      ) : null}
    </details>
  );
}
