"use client";

import { useEffect, useRef, useState } from "react";
import { FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentDrop } from "@/components/trip/document-drop";

export type DocumentChoice = {
  id: string;
  name: string;
  folder: string;
  size_bytes: number;
  modified_at: string;
  score: number;
};

// Demo mode (?demo=1): the preview is blurred so the audience cannot read the identity page.
export function DocumentPreview({ document, demo = false }: { document: DocumentChoice; demo?: boolean }) {
  const [failed, setFailed] = useState(false);
  const image = /\.(jpe?g|png)$/i.test(document.name);
  return image && !failed ? (
    // Local previews use opaque, short-lived server ids rather than Next image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/documents/preview?id=${encodeURIComponent(document.id)}`}
      alt={`Preview of ${document.name}`}
      className={`h-24 w-32 rounded-xl object-contain${demo ? " blur-md" : ""}`}
      onError={() => setFailed(true)}
    />
  ) : <FileImage className="size-10 text-muted-foreground" aria-label="No image preview available" />;
}

const TEXTS = {
  passport: {
    prompt: "I don't have your passport yet. Shall I look for it in your documents?",
    empty: "No matching files found. Drop a photo or scan of it here, or type the fields below.",
    failed: "I could not search your documents. Upload a photo or type the fields below.",
  },
  photo: {
    prompt: "The e-VOA also needs your identity photo. Shall I look for it in your documents?",
    empty: "No photo found. Drop one here, or the agent will ask you for it on the official site.",
    failed: "I could not search your documents. The agent will ask you to upload the photo on the official site.",
  },
  return_ticket: {
    prompt: "The e-VOA also needs your return flight ticket as a PDF. Shall I look for it in your documents?",
    empty: "No PDF ticket found. Drop one here, or the agent will ask you for it on the official site.",
    failed: "I could not search your documents. The agent will ask you to upload the ticket on the official site.",
  },
} as const;

export function DocumentFinder({ onConfirm, demo = false, focusOnMount = false, kind = "passport" }: {
  onConfirm: (document: DocumentChoice) => void;
  demo?: boolean;
  focusOnMount?: boolean;
  kind?: "passport" | "photo" | "return_ticket";
}) {
  const texts = TEXTS[kind];
  const [enabled, setEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [documents, setDocuments] = useState<DocumentChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchCard = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/documents/find", { cache: "no-store", signal: controller.signal })
      .then((response) => { if (response.ok) setEnabled(true); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!enabled || !focusOnMount) return;
    searchCard.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    searchCard.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [enabled, focusOnMount]);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/find?kind=${kind}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json() as { documents: DocumentChoice[] };
      setDocuments(result.documents);
    } catch {
      setError(texts.failed);
    } finally {
      setBusy(false);
    }
  };

  if (!enabled || dismissed) return null;
  return (
    <div ref={searchCard} className="space-y-3 rounded-2xl bg-muted p-4">
      <p className="text-sm">{texts.prompt}</p>
      <p className="text-xs text-muted-foreground">Only file names in your configured local folder are searched. Nothing is sent to a model.</p>
      {documents === null ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void search()}>{busy ? "Looking…" : "Yes"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setDismissed(true)}>No</Button>
        </div>
      ) : (
        <>
          {documents.length === 0 ? (
            <>
              <p className="text-sm">{texts.empty}</p>
              <DocumentDrop kind={kind} onUploaded={onConfirm} />
            </>
          ) : null}
          {documents.map((document) => (
            <div key={document.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3">
              <DocumentPreview document={document} demo={demo} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="break-all font-medium">{document.name}</p>
                <p className="break-all text-xs text-muted-foreground">{document.folder} · {document.modified_at.slice(0, 10)}</p>
              </div>
              <Button type="button" size="sm" onClick={() => onConfirm(document)}>This one</Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setDismissed(true)}>None of these</Button>
        </>
      )}
      {error ? <p role="alert" className="text-sm text-attention-foreground">{error}</p> : null}
    </div>
  );
}
