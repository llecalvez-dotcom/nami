"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentFinder, DocumentPreview, type DocumentChoice } from "@/components/trip/document-finder";

// The identity photo the agent drops on the official site: found in the local folder, shown, confirmed. Never read by a model.
export function PhotoCard({ demo, onConfirm }: { demo: boolean; onConfirm: (id: string | null) => void }) {
  const [photo, setPhoto] = useState<DocumentChoice | null>(null);
  const [search, setSearch] = useState(0);
  return (
    <section aria-label="Identity photo" className="space-y-3 rounded-3xl bg-card p-5 shadow-sm">
      <p className="text-[20px] leading-snug font-medium tracking-[-0.5px]">Identity photo</p>
      {photo ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted p-3">
          <DocumentPreview document={photo} demo={demo} />
          <p className="min-w-0 flex-1 break-all text-sm">Photo ready for the agent: {photo.name}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => {
              setPhoto(null);
              onConfirm(null);
              setSearch((request) => request + 1);
            }}
          >
            Choose another
          </Button>
        </div>
      ) : (
        <DocumentFinder
          key={search}
          kind="photo"
          demo={demo}
          onConfirm={(selected) => {
            setPhoto(selected);
            onConfirm(selected.id);
          }}
        />
      )}
      <p className="text-xs text-muted-foreground">A recent photo on a plain light background, as for a passport. It is only handed to the official site.</p>
    </section>
  );
}
