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
const HINTS: Record<Kind, string> = {
  passport: "A photo or scan of your passport: JPEG, PNG or HEIC, 5 MB max.",
  photo: "Your ID photo: JPEG, PNG or HEIC, 10 MB max.",
  return_ticket: "Your return ticket as a PDF, 10 MB max.",
};
const TYPE_ERRORS: Record<Kind, string> = {
  passport: "Send a JPEG, PNG or HEIC photo of your passport.",
  photo: "Send a JPEG, PNG or HEIC photo.",
  return_ticket: "Send a PDF.",
};
const SIZE_ERRORS: Record<Kind, string> = {
  passport: "File too large (5 MB max).",
  photo: "File too large (10 MB max).",
  return_ticket: "File too large (10 MB max).",
};
export const DROP_TEXTS = [
  "Drop the file here",
  "Choose a file",
  "Sending…",
  "The file could not be saved. Try again.",
  ...Object.values(HINTS),
  ...Object.values(TYPE_ERRORS),
  ...new Set(Object.values(SIZE_ERRORS)),
];

const EXTENSIONS: Record<Kind, RegExp> = { passport: /\.(jpe?g|png|heic)$/i, photo: /\.(jpe?g|png|heic)$/i, return_ticket: /\.pdf$/i };
const IMAGES = ".jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic";
const ACCEPT: Record<Kind, string> = { passport: IMAGES, photo: IMAGES, return_ticket: ".pdf,application/pdf" };
// The same caps as the server: the passport reader takes 5 MB, the files handed to the official site 10 MB.
const MAX_BYTES: Record<Kind, number> = { passport: 5 * 1024 * 1024, photo: 10 * 1024 * 1024, return_ticket: 10 * 1024 * 1024 };

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
    if (file.size > MAX_BYTES[kind]) return setError(t(SIZE_ERRORS[kind]));
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
