"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { Formality } from "@/lib/contracts";
import { formatDate, formatDateTime } from "@/lib/format";
import type { FormalitiesResult, LiveFormality } from "@/lib/formalities";
import { hostOf } from "@/lib/official-sites";

export type PapersQuery = { destination: string; country_iso2: string; arrival_at?: string | null };
export type LivePapersState =
  | { state: "loading"; query: PapersQuery }
  | { state: "done"; query: PapersQuery; result: FormalitiesResult }
  | { state: "error"; query: PapersQuery; message: string };

export async function fetchFormalities(query: PapersQuery): Promise<FormalitiesResult> {
  const response = await fetch("/api/formalities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  return response.json();
}

// Searches the papers live once per query; null query = nothing to search.
export function useLivePapers(query: PapersQuery | null): LivePapersState | null {
  const key = query ? `${query.destination}|${query.country_iso2}|${query.arrival_at ?? ""}` : null;
  const [state, setState] = useState<{ key: string; value: LivePapersState } | null>(null);
  useEffect(() => {
    if (!query || !key) return;
    let cancelled = false;
    fetchFormalities(query)
      .then((result) => !cancelled && setState({ key, value: { state: "done", query, result } }))
      .catch((error: Error) => !cancelled && setState({ key, value: { state: "error", query, message: error.message } }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!query || !key) return null;
  return state && state.key === key ? state.value : { state: "loading", query };
}

type Paper = Formality & Partial<Omit<LiveFormality, keyof Formality>>;

function windowText(paper: Paper): string | null {
  if (paper.opens_at) return `Opens ${formatDateTime(paper.opens_at)} (Bali time)`;
  return paper.window_note ?? null;
}

export function LivePaperCard({ paper, observedOn }: { paper: Paper; observedOn?: string | null }) {
  const host = hostOf(paper.official_url) ?? paper.official_url;
  const clickable = paper.link_official ?? paper.sources.every((s) => s.official);
  const when = windowText(paper);
  return (
    <li className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-2xl leading-tight">{paper.name}</p>
          {when ? <p className="mt-1 text-sm text-muted-foreground">{when}</p> : null}
        </div>
        <StatusBadge status={paper.status} checkedAt={paper.checked_at} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          <span className="text-muted-foreground">Official cost </span>
          <span className="font-medium">{paper.official_cost}</span>
        </span>
        {clickable ? (
          <a
            href={paper.official_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            {host} <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-attention" title="Not an official government site: not clickable">
            <ShieldAlert className="size-3.5" /> {host} (not official)
          </span>
        )}
        {paper.required === false ? <span className="text-muted-foreground">Optional</span> : null}
      </div>
      {paper.link_replaced ? (
        <p className="mt-2 text-xs text-muted-foreground">The exact page did not answer: link to the site&apos;s home page.</p>
      ) : null}
      {paper.differs && paper.differs.length > 0 ? (
        <p className="mt-2 text-xs text-attention">Differs from our last check: {paper.differs.join("; ")}.</p>
      ) : null}
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {paper.sources.map((source) => (
          <li key={source.url} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {source.official ? (
              <ShieldCheck className="size-3.5 text-primary" />
            ) : (
              <ShieldAlert className="size-3.5 text-attention" />
            )}
            {hostOf(source.url) ?? source.url}
            {source.official ? "" : " (non-official)"}
          </li>
        ))}
        <li className="text-xs text-muted-foreground">
          ·{" "}
          {paper.checked_at
            ? `Found at ${formatDateTime(paper.checked_at, "Europe/Paris")}${paper.found_on ? ` on ${paper.found_on}` : ""}`
            : observedOn
              ? `Verified by hand on ${formatDate(observedOn)}`
              : "Not checked"}
        </li>
      </ul>
    </li>
  );
}

// statuses: progress kept in the trip (for example the e-VOA "Pending approval" after the agent), by paper id.
export function LivePapersList({ papers, statuses = {} }: { papers: LivePapersState; statuses?: Record<string, Formality["status"]> }) {
  if (papers.state === "loading") {
    return (
      <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground" aria-busy="true">
        Searching the official sources live for {papers.query.destination}…
      </p>
    );
  }
  if (papers.state === "error") {
    return <p className="rounded-2xl border bg-card p-5 text-sm text-attention">{papers.message}</p>;
  }
  const { result } = papers;
  return (
    <div className="space-y-3">
      <p className={result.mode === "live" && !result.differs_from_last_check ? "text-sm text-muted-foreground" : "text-sm text-attention"}>
        {result.notice}
      </p>
      {result.missing_from_live.length > 0 ? (
        <p className="text-xs text-attention">Not found live, but on our last check: {result.missing_from_live.join(", ")}.</p>
      ) : null}
      {result.formalities.length > 0 ? (
        <ul className="space-y-3">
          {result.formalities.map((f) => (
            <LivePaperCard key={f.id} paper={statuses[f.id] ? { ...f, status: statuses[f.id] } : f} observedOn={result.verified_by_hand_on} />
          ))}
        </ul>
      ) : null}
      {result.mode === "live" && result.sources.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Sources: {result.sources.map((s) => `${hostOf(s.url) ?? s.url}${s.official ? "" : " (non-official)"}`).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
