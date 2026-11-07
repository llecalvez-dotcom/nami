import type { TripRequestDraft } from "@/lib/contracts";
import type { ParseResult } from "@/lib/trip-parse";

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function requestTripParse(input: {
  transcript: string;
  current_request?: TripRequestDraft;
  question?: string;
}): Promise<ParseResult> {
  const response = await fetch("/api/trip/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, today: localToday() }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body as ParseResult;
}
