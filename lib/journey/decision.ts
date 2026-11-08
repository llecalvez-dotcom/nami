// Journey decision layer (P1, 2026-11-08): should Nami suggest leaving from another hub than the city the traveller
// named? Pure and small: the named city is the default, one alternative at most, and the alternative is offered only
// when the net saving is verified and large enough, the extra time reasonable, and the connection passes the safety
// gate. Nothing here talks to H or Google Flights: the client gives what was read, this says what to do with it.

export const MIN_NET_SAVINGS_EUR = 90;
// Train plus airport transfer plus waiting: beyond four extra hours, the saving is not worth the day.
export const MAX_EXTRA_MINUTES = 240;
// Separate tickets (a train, then a flight bought apart): nobody rebooks you if the train is late. Three hours between
// the arrival at the hub and the departure is the least we accept, and even then it is never called risk free.
export const MIN_SEPARATE_TICKETS_BUFFER_MIN = 180;

export type Ticketing = "single_ticket" | "separate_tickets";

export type ExtraCost = {
  kind: "train" | "bus" | "airport_transfer" | "parking" | "night" | "other";
  label: string;
  price_eur: number;
  duration_min: number;
  // Read on a real page (SNCF, the airport, the airline), not guessed. An unverified cost blocks any claim of saving.
  verified: boolean;
};

export type DepartureOption = {
  city: string;
  // The flights as read on Google Flights for the whole party, in euros.
  flight_price_eur: number;
  flight_duration_min: number;
  extras: ExtraCost[];
  // How the access leg and the flight are tied: a train bought apart from the flight is separate_tickets.
  ticketing: Ticketing;
  // Minutes between the planned arrival at the hub (train, bus) and the flight's departure; null when there is no access leg.
  buffer_min: number | null;
};

export type ConnectionRisk = {
  level: "none" | "protected" | "acceptable" | "risky";
  // Always false for separate tickets, whatever the buffer: the rule the traveller asked for.
  risk_free: boolean;
  reason: string;
};

export type JourneyDecision = {
  // What Nami does: nothing (the named city stays) or asks the traveller about the alternative.
  action: "keep_original" | "offer_alternative";
  original: string;
  alternative: string | null;
  net_savings_eur: number;
  extra_minutes: number;
  savings_verified: boolean;
  risk: ConnectionRisk | null;
  // One short sentence for the traveller, or for the log when nothing is said.
  summary: string;
};

export const extrasTotal = (extras: ExtraCost[]) => extras.reduce((sum, e) => sum + e.price_eur, 0);
export const extrasMinutes = (extras: ExtraCost[]) => extras.reduce((sum, e) => sum + e.duration_min, 0);
const totalCost = (o: DepartureOption) => o.flight_price_eur + extrasTotal(o.extras);
const totalMinutes = (o: DepartureOption) => o.flight_duration_min + extrasMinutes(o.extras);

// The saving once every extra cost is counted; verified only if every extra cost of both options was read somewhere.
export function netSavings(original: DepartureOption, alternative: DepartureOption): { net_eur: number; verified: boolean } {
  const verified = [...original.extras, ...alternative.extras].every((e) => e.verified);
  return { net_eur: Math.round(totalCost(original) - totalCost(alternative)), verified };
}

export function connectionRisk(option: DepartureOption): ConnectionRisk {
  if (option.extras.length === 0 || option.buffer_min === null) return { level: "none", risk_free: true, reason: "No connection before the flight." };
  if (option.ticketing === "single_ticket") {
    return { level: "protected", risk_free: false, reason: "Train and flight on one ticket: the carrier rebooks you if the train is late." };
  }
  if (option.buffer_min < MIN_SEPARATE_TICKETS_BUFFER_MIN) {
    return { level: "risky", risk_free: false, reason: `Separate tickets with ${option.buffer_min} min before the flight: a late train means a lost flight, nobody rebooks you.` };
  }
  return { level: "acceptable", risk_free: false, reason: `Separate tickets with ${Math.round(option.buffer_min / 60)} h before the flight: acceptable, but a late train stays your risk.` };
}

const euros = (n: number) => `${Math.abs(n)} €`;
const hours = (min: number) => (min % 60 === 0 ? `${min / 60} h` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`);

// The decision, from the city named (always the default) and at most one alternative hub.
export function decideDeparture(original: DepartureOption, alternative: DepartureOption | null): JourneyDecision {
  const base = { original: original.city, alternative: alternative?.city ?? null };
  if (!alternative) return { ...base, action: "keep_original", net_savings_eur: 0, extra_minutes: 0, savings_verified: true, risk: null, summary: `Flights from ${original.city}, as you asked.` };
  const { net_eur, verified } = netSavings(original, alternative);
  const extra_minutes = Math.max(0, totalMinutes(alternative) - totalMinutes(original));
  const risk = connectionRisk(alternative);
  const keep = (summary: string): JourneyDecision => ({ ...base, action: "keep_original", net_savings_eur: net_eur, extra_minutes, savings_verified: verified, risk, summary });
  if (!verified) return keep(`${original.city} kept: the extra costs of leaving from ${alternative.city} are not verified, so no saving is claimed.`);
  if (net_eur < MIN_NET_SAVINGS_EUR) return keep(`${original.city} kept: leaving from ${alternative.city} would save ${net_eur <= 0 ? "nothing" : euros(net_eur)} net, under ${MIN_NET_SAVINGS_EUR} €.`);
  if (extra_minutes > MAX_EXTRA_MINUTES) return keep(`${original.city} kept: leaving from ${alternative.city} saves ${euros(net_eur)} but adds ${hours(extra_minutes)}.`);
  if (risk.level === "risky") return keep(`${original.city} kept: leaving from ${alternative.city} saves ${euros(net_eur)} but the connection is not safe. ${risk.reason}`);
  const caveat = risk.level === "acceptable" ? ` ${risk.reason}` : risk.level === "protected" ? " Train and flight on one ticket." : "";
  return {
    ...base, action: "offer_alternative", net_savings_eur: net_eur, extra_minutes, savings_verified: true, risk,
    summary: `Leaving from ${alternative.city} instead of ${original.city} saves ${euros(net_eur)} net, train and transfers counted, for ${hours(extra_minutes)} more.${caveat} Shall I look at it, or keep ${original.city}?`,
  };
}
