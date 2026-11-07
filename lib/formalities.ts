import { z } from "zod";
import { BALI_PAPERS, type BaliPaper } from "@/lib/bali-papers";
import type { Formality, Source } from "@/lib/contracts";
import { countryName } from "@/lib/countries";
import { LinkupError, linkupStructuredSearch, type LinkupStructuredAnswer } from "@/lib/linkup";
import { checkOfficialLink, governmentDomainsFor, hostOf, isOfficialUrl, OBSERVED_ON } from "@/lib/official-sites";
import { FILLING_COUNTRY_BY_COUNTRY, formalityWindows, isBali } from "@/lib/planner";

export const LIVE_TIMEOUT_MS = 15_000;

export const FormalitiesInputSchema = z.object({
  destination: z.string().trim().min(1).max(120),
  country_iso2: z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2, uppercase"),
  arrival_at: z
    .union([z.iso.datetime({ offset: true }), z.iso.datetime({ offset: true, precision: -1 })])
    .nullish(),
});
export type FormalitiesInput = z.infer<typeof FormalitiesInputSchema>;

export type LiveFormality = Formality & {
  kind: string;
  window_note: string | null;
  // The official_url passed the domain check: only then is it rendered as a link.
  link_official: boolean;
  // The HEAD request on the official_url failed: replaced by the home page of its domain.
  link_replaced: boolean;
  // Host of the page the paper was read on ("found at 14:02 on diplomatie.gouv.fr").
  found_on: string | null;
  // Differences with the hand-verified Bali table (empty elsewhere).
  differs: string[];
};

export type FormalitiesResult = {
  mode: "live" | "fallback" | "unavailable";
  destination: string;
  country_iso2: string;
  country_name: string;
  checked_at: string | null;
  duration_ms: number;
  searched_domains: string[];
  formalities: LiveFormality[];
  sources: Source[];
  // Only Bali can be filled in by the agent.
  fillable: boolean;
  differs_from_last_check: boolean;
  // Papers of the hand-verified table that the live answer did not return.
  missing_from_live: string[];
  verified_by_hand_on: string | null;
  error: string | null;
  notice: string;
};

export const LINKUP_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    formalities: {
      type: "array",
      description:
        "Entry formalities this traveller must or can do before or on arrival (visa, travel authorization, arrival card, entry tax, mandatory insurance or health form). Empty if none.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Official name of the formality" },
          kind: { type: "string", enum: ["visa", "travel_authorization", "arrival_card", "tax", "health", "other"] },
          required: {
            type: "boolean",
            description: "true only if this traveller must do it; false if exempted, optional or only recommended",
          },
          official_cost: { type: "string", description: "Official cost with its currency, or Free" },
          official_url: { type: "string", description: "URL of the official government website where it is done" },
          when: { type: "string", description: "When it can or must be done, relative to departure or arrival" },
          source_url: { type: "string", description: "URL of the page where this information was found" },
        },
        required: ["name", "kind", "required", "official_cost", "official_url", "when", "source_url"],
      },
    },
  },
  required: ["formalities"],
} as const;

const LinkupItemSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.string().optional().catch(undefined),
  required: z.union([z.boolean(), z.string()]).optional().catch(undefined),
  official_cost: z.string().optional().catch(undefined),
  official_url: z.string().optional().catch(undefined),
  when: z.string().optional().catch(undefined),
  source_url: z.string().optional().catch(undefined),
});
type LinkupItem = z.infer<typeof LinkupItemSchema>;

const LinkupDataSchema = z.object({ formalities: z.array(z.unknown()) });

export function buildQuery({ destination, country_iso2 }: Pick<FormalitiesInput, "destination" | "country_iso2">): string {
  const country = countryName(country_iso2);
  const place = destination.toLowerCase() === country.toLowerCase() ? country : `${destination}, ${country}`;
  return (
    `Which entry formalities does a traveller with a French passport, leaving from France, need for a short tourist stay in ${place}? ` +
    `Use France Diplomatie (conseils aux voyageurs, entrée et séjour, ${country}) and the official government websites of ${country}. ` +
    `List each visa, electronic travel authorization, online arrival card or entry tax that applies, with its official name, ` +
    `whether it is mandatory, its official cost, the official government website where it is done, and when it can be done. ` +
    `Answer in English. Write "Not stated" when a source does not give a value; never guess.`
  );
}

const NOT_FOUND =
  /\b(not (found|stated|specified|confirmed|available|provided|mentioned)|unknown|n\/a)\b|non (indiqu|précis|mentionn|communiqu)|inconnu/i;
const NOT_NEEDED =
  /\b(not required|no visa (is )?(required|needed)|optional|recommended|exempt(ed|ion)?|visa[- ]free)\b|non requis|pas requis|facultati|exempt/i;

function asUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Linkup sometimes marks a visa exemption or a recommended form as required: its own wording wins.
function asRequired(item: LinkupItem): boolean {
  const said = item.required;
  if (said === false || (typeof said === "string" && /^\s*(no|not required|optional|false)\b/i.test(said))) return false;
  return ![item.name, item.official_cost, item.when].some((text) => text && NOT_NEEDED.test(text));
}

function asCost(value: string | undefined): string {
  const cost = value?.trim();
  return !cost || NOT_FOUND.test(cost) ? "Not stated on the source" : cost;
}

function asText(value: string | undefined): string | null {
  const text = value?.trim();
  return !text || NOT_FOUND.test(text) ? null : text;
}

function toSources(sources: LinkupStructuredAnswer["sources"], extra: (string | null)[]): Source[] {
  const urls = [...extra, ...sources.map((s) => s.url)].flatMap((u) => {
    const url = asUrl(u ?? undefined);
    return url ? [url] : [];
  });
  return [...new Set(urls)].map((url) => ({ url, official: isOfficialUrl(url) }));
}

// Cost as a number for comparison: "IDR 500,000" -> 500000, "Free" -> 0, unknown -> null.
export function costAmount(cost: string): number | null {
  if (/\b(free|gratuit|no (fee|cost|charge))\b/i.test(cost)) return 0;
  const match = cost.replace(/(\d)[\s.,](?=\d{3}\b)/g, "$1").match(/\d+/);
  return match ? Number(match[0]) : null;
}

const BALI_KEYWORDS: Record<BaliPaper["id"], { kind: string; words: RegExp }> = {
  evoa: { kind: "visa", words: /visa on arrival|e-?voa|\bvoa\b/i },
  arrival_card: { kind: "arrival_card", words: /arrival card|all indonesia|customs declaration|e-?cd\b/i },
  bali_levy: { kind: "tax", words: /levy|love ?bali|tourist tax|\bpwa\b/i },
};

function matchBaliPaper(item: LiveFormality, taken: Set<string>): BaliPaper | null {
  const host = hostOf(item.official_url);
  const free = BALI_PAPERS.filter((p) => !taken.has(p.id));
  return (
    free.find((p) => host === p.domain) ??
    free.find((p) => BALI_KEYWORDS[p.id].words.test(item.name)) ??
    free.find((p) => BALI_KEYWORDS[p.id].kind === item.kind) ??
    null
  );
}

function compareWithTable(item: LiveFormality, paper: BaliPaper): string[] {
  const differs: string[] = [];
  const live = costAmount(item.official_cost);
  const table = costAmount(paper.official_cost);
  if (live !== table) differs.push(`cost: ${item.official_cost} live, ${paper.official_cost} on our last check`);
  const host = hostOf(item.official_url);
  if (host !== paper.domain) differs.push(`site: ${host ?? "none"} live, ${paper.domain} on our last check`);
  return differs;
}

function applyBaliTable(formalities: LiveFormality[], input: FormalitiesInput) {
  const taken = new Set<string>();
  const windows = input.arrival_at ? formalityWindows({ arrival_at: input.arrival_at }, BALI_PAPERS) : [];
  const matched = formalities.map((item) => {
    const paper = matchBaliPaper(item, taken);
    if (!paper) return item;
    taken.add(paper.id);
    const window = windows.find((w) => w.id === paper.id);
    return {
      ...item,
      id: paper.id,
      opens_at: window?.opens_at ?? null,
      closes_at: window?.closes_at ?? null,
      differs: compareWithTable(item, paper),
    };
  });
  const missing = BALI_PAPERS.filter((p) => !taken.has(p.id)).map((p) => p.short_name);
  return { formalities: matched, missing };
}

export function baliTableFormalities(input: Pick<FormalitiesInput, "arrival_at">): LiveFormality[] {
  const windows = input.arrival_at ? formalityWindows({ arrival_at: input.arrival_at }, BALI_PAPERS) : [];
  return BALI_PAPERS.map((paper) => ({
    id: paper.id,
    name: paper.name,
    required: true,
    official_url: paper.official_url,
    official_cost: paper.official_cost,
    opens_at: windows.find((w) => w.id === paper.id)?.opens_at ?? null,
    closes_at: windows.find((w) => w.id === paper.id)?.closes_at ?? null,
    sources: paper.source_urls.map((url) => ({ url, official: isOfficialUrl(url) })),
    status: "suggested",
    checked_at: null,
    kind: BALI_KEYWORDS[paper.id].kind,
    window_note: paper.window_note,
    link_official: isOfficialUrl(paper.official_url),
    link_replaced: false,
    found_on: null,
    differs: [],
  }));
}

type Deps = { apiKey: string | undefined; fetch?: typeof fetch; now?: () => Date; timeoutMs?: number };

const HAND_CHECK = `verified by hand on 7 Nov 2026`;

export async function findFormalities(input: FormalitiesInput, deps: Deps): Promise<FormalitiesResult> {
  const now = deps.now ?? (() => new Date());
  const started = now().getTime();
  const bali = isBali(input);
  const searched_domains = governmentDomainsFor(input.country_iso2);
  const base = {
    destination: input.destination,
    country_iso2: input.country_iso2,
    country_name: countryName(input.country_iso2),
    searched_domains,
    fillable: bali,
  };

  const fallback = (error: string): FormalitiesResult => ({
    ...base,
    mode: bali ? "fallback" : "unavailable",
    checked_at: null,
    duration_ms: now().getTime() - started,
    formalities: bali ? baliTableFormalities(input) : [],
    sources: [],
    differs_from_last_check: false,
    missing_from_live: [],
    verified_by_hand_on: bali ? OBSERVED_ON : null,
    error,
    notice: bali
      ? `Live search unavailable (${error}). Showing our list, ${HAND_CHECK}.`
      : `Live search unavailable (${error}). No verified list for ${base.country_name}: check diplomatie.gouv.fr.`,
  });

  if (!deps.apiKey) return fallback("LINKUP_API_KEY is not set");

  let answer: LinkupStructuredAnswer;
  try {
    answer = await linkupStructuredSearch(
      { q: buildQuery(input), includeDomains: searched_domains, schema: LINKUP_OUTPUT_SCHEMA },
      { apiKey: deps.apiKey, fetch: deps.fetch, timeoutMs: deps.timeoutMs ?? LIVE_TIMEOUT_MS },
    );
  } catch (error) {
    return fallback(error instanceof LinkupError ? error.message : "Linkup failed");
  }

  const data = LinkupDataSchema.safeParse(answer.data);
  if (!data.success) return fallback("Linkup answer did not match the expected format");
  const checked_at = now().toISOString();
  const items = data.data.formalities.flatMap((raw) => {
    const item = LinkupItemSchema.safeParse(raw);
    return item.success ? [item.data] : [];
  });

  const formalities = (
    await Promise.all(
      items.map(async (item, i): Promise<LiveFormality | null> => {
        const sourceUrl = asUrl(item.source_url);
        const candidate = asUrl(item.official_url) ?? sourceUrl;
        if (!candidate) return null;
        const link = await checkOfficialLink(candidate, { fetch: deps.fetch });
        const found_on = hostOf(sourceUrl ?? answer.sources[0]?.url ?? "") ?? null;
        return {
          id: `live-${i + 1}`,
          name: item.name,
          required: asRequired(item),
          official_url: link.url,
          official_cost: asCost(item.official_cost),
          opens_at: null,
          closes_at: null,
          sources: toSources([], [sourceUrl, link.url !== candidate ? candidate : null]),
          status: "checked",
          checked_at,
          kind: item.kind ?? "other",
          window_note: asText(item.when),
          link_official: link.official,
          link_replaced: link.replaced,
          found_on,
          differs: [],
        };
      }),
    )
  ).filter((f): f is LiveFormality => f !== null);

  if (formalities.length === 0 && bali) return fallback("Linkup returned no usable paper");

  const compared = bali ? applyBaliTable(formalities, input) : { formalities, missing: [] };
  const differs = compared.missing.length > 0 || compared.formalities.some((f) => f.differs.length > 0);
  const sourceLine = formalities[0]?.found_on ? ` on ${formalities[0].found_on}` : "";
  return {
    ...base,
    mode: "live",
    checked_at,
    duration_ms: now().getTime() - started,
    formalities: compared.formalities,
    sources: toSources(answer.sources, []),
    differs_from_last_check: differs,
    missing_from_live: compared.missing,
    verified_by_hand_on: bali ? OBSERVED_ON : null,
    error: null,
    notice: bali
      ? differs
        ? `Found live${sourceLine}. This differs from our last check (${HAND_CHECK}).`
        : `Found live${sourceLine}. Matches our last check (${HAND_CHECK}).`
      : formalities.length === 0
        ? `No entry paper found live for a French passport in ${base.country_name}. Check diplomatie.gouv.fr.`
        : `Found live${sourceLine}, not verified by hand. ${FILLING_COUNTRY_BY_COUNTRY}`,
  };
}
