"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileUp, Loader2 } from "lucide-react";
import type { DocumentChoice } from "@/components/trip/document-finder";
import { cn } from "@/lib/utils";

type Kind = "passport" | "photo" | "return_ticket";
type Translate = (text: string) => string;

// The upload zone shown when Nami finds no passport, ID photo or return ticket on this computer: the traveller drops a
// file or chooses one, it is saved in the documents folder (POST /api/documents/upload) and the path resumes as if the
// file had been found. Fixed texts only, so the panel can translate them.
export const DROP_TEXTS = [
  "Drop the file here",
  "Choose a file",
  "Sending…",
  "A photo or scan of your passport: JPEG, PNG, HEIC or PDF, 10 MB max.",
  "Your ID photo: JPEG, PNG or HEIC, 10 MB max.",
  "Your return ticket as a PDF, 10 MB max.",
  "Send a JPEG, PNG, HEIC or PDF.",
  "Send a JPEG, PNG or HEIC photo.",
  "Send a PDF.",
  "File too large (10 MB max).",
  "The file could not be saved. Try again.",
];

const HINTS: Record<Kind, string> = { passport: DROP_TEXTS[3], photo: DROP_TEXTS[4], return_ticket: DROP_TEXTS[5] };
const TYPE_ERRORS: Record<Kind, string> = { passport: DROP_TEXTS[6], photo: DROP_TEXTS[7], return_ticket: DROP_TEXTS[8] };
const EXTENSIONS: Record<Kind, RegExp> = { passport: /\.(jpe?g|png|heic|pdf)$/i, photo: /\.(jpe?g|png|heic)$/i, return_ticket: /\.pdf$/i };
const ACCEPT: Record<Kind, string> = {
  passport: ".jpg,.jpeg,.png,.heic,.pdf,image/jpeg,image/png,image/heic,application/pdf",
  photo: ".jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic",
  return_ticket: ".pdf,application/pdf",
};
const MAX_BYTES = 10 * 1024 * 1024;

export function DocumentDrop({ kind, onUploaded, t = (text) => text, className }: {
  kind: Kind;
  onUploaded: (document: DocumentChoice) => void;
  t?: Translate;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const send = async (file: File) => {
    setError(null);
    if (!EXTENSIONS[kind].test(file.name)) return setError(t(TYPE_ERRORS[kind]));
    if (file.size > MAX_BYTES) return setError(t("File too large (10 MB max)."));
    setBusy(true);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const response = await fetch("/api/documents/upload", { method: "POST", body: form });
      const body = (await response.json()) as DocumentChoice & { error?: string };
      if (!response.ok) throw new Error(body.error ?? t("The file could not be saved. Try again."));
      onUploaded(body);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("The file could not be saved. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void send(file);
  };

  return (
    <div className={className}>
      <div
        role="group"
        aria-label={t(HINTS[kind])}
        data-over={over || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors",
          over ? "border-[var(--paper,var(--primary))] bg-[var(--np-fill,var(--muted))]" : "border-[var(--np-line,var(--border))]",
        )}
      >
        {busy ? <Loader2 className="size-6 animate-spin opacity-70" /> : <FileUp className="size-6 opacity-70" />}
        <p className="text-[15px] leading-snug">{busy ? t("Sending…") : t("Drop the file here")}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="inline-flex h-9 items-center rounded-full bg-[var(--np-ink,var(--primary))] px-4 text-sm font-medium text-[var(--np-on-accent,var(--primary-foreground))] disabled:opacity-50"
        >
          {t("Choose a file")}
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT[kind]}
          className="sr-only"
          disabled={busy}
          aria-label={t("Choose a file")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void send(file);
          }}
        />
        <p className="text-xs opacity-70">{t(HINTS[kind])}</p>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-[var(--np-coral,var(--attention-foreground))]">{error}</p> : null}
    </div>
  );
}
