"use client";

import { useEffect, useState } from "react";
import { FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function DocumentFinder({ onConfirm, demo = false }: { onConfirm: (document: DocumentChoice) => void; demo?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [documents, setDocuments] = useState<DocumentChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/documents/find", { cache: "no-store", signal: controller.signal })
      .then((response) => { if (response.ok) setEnabled(true); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/documents/find?kind=passport", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json() as { documents: DocumentChoice[] };
      setDocuments(result.documents);
    } catch {
      setError("I could not search your documents. Upload a photo or type the fields below.");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled || dismissed) return null;
  return (
    <div className="space-y-3 rounded-2xl bg-muted p-4">
      <p className="text-sm">I don&apos;t have your passport yet. Shall I look for it in your documents?</p>
      <p className="text-xs text-muted-foreground">Only file names in your configured local folder are searched. Nothing is sent to a model.</p>
      {documents === null ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void search()}>{busy ? "Looking…" : "Yes"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setDismissed(true)}>No</Button>
        </div>
      ) : (
        <>
          {documents.length === 0 ? <p className="text-sm">No matching files found. Upload a photo or type the fields below.</p> : null}
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
