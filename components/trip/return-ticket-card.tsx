"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentFinder, DocumentPreview, type DocumentChoice } from "@/components/trip/document-finder";

// The PDF return ticket the agent drops in the e-VOA Return Ticket field (ticket 17): found in the local folder,
// confirmed here. Without it the agent asks the traveller and never uploads another file in its place.
export function ReturnTicketCard({ demo, onConfirm }: { demo: boolean; onConfirm: (id: string | null) => void }) {
  const [ticket, setTicket] = useState<DocumentChoice | null>(null);
  const [search, setSearch] = useState(0);
  return (
    <section aria-label="Return ticket" className="space-y-3 rounded-3xl bg-card p-5 shadow-sm">
      <p className="text-[20px] leading-snug font-medium tracking-[-0.5px]">Return ticket</p>
      {ticket ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted p-3">
          <DocumentPreview document={ticket} demo={demo} />
          <p className="min-w-0 flex-1 break-all text-sm">Return ticket ready for the agent: {ticket.name}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => {
              setTicket(null);
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
          kind="return_ticket"
          demo={demo}
          onConfirm={(selected) => {
            setTicket(selected);
            onConfirm(selected.id);
          }}
        />
      )}
      <p className="text-xs text-muted-foreground">A PDF of your flight out of Indonesia. The official site requires it; it is only handed to that site.</p>
    </section>
  );
}
