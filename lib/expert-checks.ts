import type { Formality } from "@/lib/contracts";
import type { FormalitiesResult } from "@/lib/formalities";
import { expiryWarning, type TripDates } from "@/lib/passport-dates";

// "Checked by Nami": the checks Nami really ran for this trip, shown under the marks of the panel. A check appears
// only once its evidence exists (a live answer, a verified MRZ, a computed window); none is ever shown in advance.
export type ExpertCheck = { id: string; label: string; state: "ok" | "warn" };

export type ExpertChecksInput = {
  // The live search of the entry papers (Linkup on government domains), null while it runs or when it failed.
  live: FormalitiesResult | null;
  // Fields of the machine-readable line that matched the printed passport (0: not verified).
  mrzVerified: number;
  // Expiry date of the confirmed passport (YYYY-MM-DD), null before it is confirmed.
  passportExpiry: string | null;
  dates: TripDates;
  // Indonesia's 6-month validity rule is the one Nami knows: checked only for a trip to Indonesia.
  countryIso2: string | null;
  formalities: Formality[];
  // An agent session ran on an official paper site, under the domain guard that stops it off the site.
  agentOnOfficialSite: boolean;
};

export const EXPERT_CHECK_LABELS = [
  "Official sources",
  "Matches our hand check",
  "Differs from our last check",
  "MRZ check digits valid",
  "Passport valid 6 months",
  "Passport expires too soon",
  "Deadlines set",
  "Official site only",
] as const;

export function expertChecks(input: ExpertChecksInput): ExpertCheck[] {
  const checks: ExpertCheck[] = [];
  const { live } = input;
  if (live && live.mode === "live" && live.sources.some((source) => source.official)) {
    checks.push({ id: "sources", label: "Official sources", state: "ok" });
  }
  if (live && live.mode === "live" && live.verified_by_hand_on) {
    checks.push(
      live.differs_from_last_check
        ? { id: "hand", label: "Differs from our last check", state: "warn" }
        : { id: "hand", label: "Matches our hand check", state: "ok" },
    );
  }
  if (input.mrzVerified > 0) checks.push({ id: "mrz", label: "MRZ check digits valid", state: "ok" });
  if (input.passportExpiry && input.countryIso2 === "ID" && (input.dates.return_date || input.dates.arrival_at)) {
    checks.push(
      expiryWarning(input.passportExpiry, input.dates)
        ? { id: "validity", label: "Passport expires too soon", state: "warn" }
        : { id: "validity", label: "Passport valid 6 months", state: "ok" },
    );
  }
  if (input.formalities.some((formality) => formality.opens_at || formality.closes_at)) {
    checks.push({ id: "windows", label: "Deadlines set", state: "ok" });
  }
  if (input.agentOnOfficialSite) checks.push({ id: "domain", label: "Official site only", state: "ok" });
  return checks;
}
