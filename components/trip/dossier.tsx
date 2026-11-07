"use client";

import { ExternalLink, Octagon, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModuleStateBadge, SampleBadge, StatusBadge } from "@/components/status-badge";
import { getBaliPaper, type BaliPaperId } from "@/lib/bali-papers";
import type { Formality, ModuleKind, ModuleSuggestion, TripRequestDraft } from "@/lib/contracts";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { LivePapersList, type LivePapersState } from "@/components/trip/live-papers";
import { isAgentActive, type Trip } from "@/lib/trip-state";

const MODULES: { module: ModuleKind; label: string }[] = [
  { module: "papers", label: "Entry papers" },
  { module: "flights", label: "Flight" },
  { module: "hotel", label: "Hotel" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

function Summary({ request }: { request: TripRequestDraft }) {
  const rows: [string, string | null][] = [
    ["Departure", request.departure_date ? formatDate(request.departure_date) : null],
    ["Landing", request.arrival_at ? `${formatDateTime(request.arrival_at)} (Bali time)` : null],
    ["Return", request.return_date ? formatDate(request.return_date) : null],
    ["Purpose", request.purpose],
    ["Passport", request.nationality],
    ["Travellers", request.travellers?.toString() ?? null],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className={value ? "mt-0.5 text-[17px] font-semibold tracking-tight" : "mt-0.5 text-[17px] font-semibold text-muted-foreground/50"}>{value ?? "To confirm"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Modules({ modules }: { modules: ModuleSuggestion[] }) {
  return (
    <ul className="grid gap-2">
      {MODULES.map(({ module, label }) => (
        <li key={module} className="flex items-center justify-between gap-2 rounded-2xl bg-muted px-4 py-3">
          <span className="text-sm font-medium">{label}</span>
          <ModuleStateBadge state={modules.find((m) => m.module === module)?.state ?? null} />
        </li>
      ))}
    </ul>
  );
}

function windowText(formality: Formality): string {
  const paper = getBaliPaper(formality.id as BaliPaperId);
  if (formality.opens_at) return `Opens ${formatDateTime(formality.opens_at)} (Bali time)`;
  return paper.window_note;
}

function PaperCard({ formality }: { formality: Formality }) {
  const paper = getBaliPaper(formality.id as BaliPaperId);
  return (
    <li className="rounded-[24px] bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg leading-snug font-semibold tracking-tight">{formality.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{windowText(formality)}</p>
        </div>
        <StatusBadge status={formality.status} checkedAt={formality.checked_at} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          <span className="text-muted-foreground">Official cost </span>
          <span className="font-medium">{formality.official_cost}</span>
        </span>
        <a
          href={formality.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          {paper.domain} <ExternalLink className="size-3.5" />
        </a>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {formality.sources.map((source) => (
          <li key={source.url} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {source.official ? (
              <>
                <ShieldCheck className="size-3.5 text-primary" /> Official source
              </>
            ) : (
              <>
                <ShieldAlert className="size-3.5 text-attention-foreground" /> Non-official source
              </>
            )}
          </li>
        ))}
        <li className="text-xs text-muted-foreground">· Read on official sites on {formatDate(paper.observed_on)}</li>
      </ul>
    </li>
  );
}

function AgentActivity({ trip, onStop }: { trip: Trip; onStop: () => void }) {
  const run = trip.agent_run;
  const active = isAgentActive(run);
  return (
    <div className="rounded-[28px] bg-foreground p-6 text-background shadow-float">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SectionTitle>Agent Activity</SectionTitle>
            {trip.sample && run ? <SampleBadge className="h-5 text-[10px]" /> : null}
          </div>
          <p className="mt-1 text-sm text-background/60">
            {run ? `Started at ${formatTime(run.started_at)} · ${run.state.replaceAll("_", " ")}` : "No agent running."}
          </p>
          {run?.metrics ? (
            <p className="mt-0.5 text-xs text-[#f7f5f1]/60">
              {run.metrics.steps} steps
              {run.metrics.total_cost !== null ? ` · cost $${run.metrics.total_cost.toFixed(4)}` : ""}
            </p>
          ) : null}
        </div>
        <Button
          variant="destructive"
          size="lg"
          className="h-10 rounded-full bg-destructive px-4 text-white hover:bg-destructive/85 disabled:bg-white/10 disabled:text-white/50"
          disabled={!active}
          onClick={onStop}
        >
          <Octagon /> Stop agent
        </Button>
      </div>
      {trip.agent_steps.length > 0 ? (
        <ol className="mt-5 space-y-2.5 border-t border-white/10 pt-5">
          {trip.agent_steps.map((step, i) => (
            <li key={`${i}-${step}`} className="flex gap-3 text-sm">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/10 font-mono text-[10px] text-background/70">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function Dossier({
  trip,
  onStop,
  livePapers = null,
  children,
}: {
  trip: Trip;
  onStop: () => void;
  livePapers?: LivePapersState | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="space-y-5 rounded-[28px] bg-card p-6 shadow-soft">
        <SectionTitle>Your trip</SectionTitle>
        <Summary request={trip.request} />
      </section>
      <section className="space-y-4 rounded-[28px] bg-card p-6 shadow-soft">
        <SectionTitle>What I can do</SectionTitle>
        <Modules modules={trip.modules} />
      </section>
      {trip.formalities.length > 0 ? (
        <section className="space-y-4 pt-2">
          <SectionTitle>Entry papers</SectionTitle>
          {livePapers ? (
            <LivePapersList
              papers={livePapers}
              statuses={Object.fromEntries(
                trip.formalities.filter((f) => f.status === "pending_approval" || f.status === "confirmed").map((f) => [f.id, f.status]),
              )}
            />
          ) : (
            <ul className="space-y-3">
              {trip.formalities.map((f) => (
                <PaperCard key={f.id} formality={f} />
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {children}
      <AgentActivity trip={trip} onStop={onStop} />
    </div>
  );
}
