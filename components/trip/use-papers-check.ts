"use client";

import { useEffect } from "react";
import { useLivePapers, type LivePapersState } from "@/components/trip/live-papers";
import { applyLivePapers, type Trip } from "@/lib/trip-state";
import { getTrip, saveTrip } from "@/lib/trip-store";

// Searches the entry papers live for a real trip: once the request is complete outside Bali (papers_check "pending",
// the answer is written into the trip once), and again on every visit when the folder already holds papers.
export function usePapersCheck(trip: Trip | null): LivePapersState | null {
  const { destination, country_iso2, arrival_at, departure_date, nationality, origin_country } = trip?.request ?? {};
  const wanted = trip !== null && !trip.sample && (trip.formalities.length > 0 || trip.papers_check === "pending");
  const live = useLivePapers(
    wanted && destination && country_iso2 ? { destination, country_iso2, arrival_at, departure_date, nationality, origin_country } : null,
  );
  const id = trip?.id ?? null;
  const pending = trip?.papers_check === "pending";
  useEffect(() => {
    if (!id || !pending || !live || live.state === "loading") return;
    const current = getTrip(id);
    if (current) saveTrip(applyLivePapers(current, live.state === "done" ? live.result : null));
  }, [id, pending, live]);
  return live;
}
