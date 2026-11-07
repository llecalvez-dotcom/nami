"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LivePapersList, useLivePapers, type PapersQuery } from "@/components/trip/live-papers";
import { countryFromName, countryName } from "@/lib/countries";

// Demo only (?demo=1): live papers for any country. Bali is the only one filled in by the agent.
export function TryAnotherCountry() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<PapersQuery | null>(null);
  const papers = useLivePapers(query);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const iso2 = countryFromName(text);
    if (!iso2) {
      setError("Unknown country: try its English name.");
      setQuery(null);
      return;
    }
    setError(null);
    setQuery({ destination: text.trim().toLowerCase() === "bali" ? "Bali" : countryName(iso2), country_iso2: iso2 });
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">Try another country</h3>
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Japan, Tanzania, Kenya…"
          aria-label="Try another country"
          className="h-9 bg-card"
        />
        <Button type="submit" size="lg" className="h-9 rounded-full" disabled={!text.trim() || papers?.state === "loading"}>
          <Search /> Search
        </Button>
      </form>
      {error ? <p className="text-sm text-attention">{error}</p> : null}
      {papers ? (
        <div className="space-y-2">
          <p className="font-heading text-xl">{papers.query.destination}</p>
          <LivePapersList papers={papers} />
        </div>
      ) : null}
    </section>
  );
}
