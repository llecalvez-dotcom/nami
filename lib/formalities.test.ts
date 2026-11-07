import { describe, expect, it, vi } from "vitest";
import { buildQuery, costAmount, findFormalities, LINKUP_OUTPUT_SCHEMA } from "@/lib/formalities";

const NOW = new Date("2026-11-07T13:02:00Z");
const BALI = { destination: "Bali", country_iso2: "ID", arrival_at: "2026-11-10T14:30+08:00" };

const BALI_LIVE = {
  formalities: [
    {
      name: "Electronic Visa on Arrival (e-VOA)",
      kind: "visa",
      required: true,
      official_cost: "IDR 500,000",
      official_url: "https://evisa.imigrasi.go.id/web/visa-selection",
      when: "Before departure",
      source_url: "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/conseils-par-pays-destination/indonesie/",
    },
    {
      name: "All Indonesia arrival card",
      kind: "arrival_card",
      required: true,
      official_cost: "Free",
      official_url: "https://allindonesia.imigrasi.go.id/arrival-card-submission/personal-information",
      when: "Within 3 days before arrival",
      source_url: "https://allindonesia.imigrasi.go.id/",
    },
    {
      name: "Bali tourist levy",
      kind: "tax",
      required: true,
      official_cost: "IDR 150.000",
      official_url: "https://lovebali.baliprov.go.id",
      when: "Before departure or at the airport",
      source_url: "https://lovebali.baliprov.go.id/faq",
    },
  ],
};

type Route = { linkup?: () => Response | Promise<Response>; head?: (url: string) => Response };

// Simulated network: Linkup answers on POST, official sites answer HEAD. Nothing leaves the process.
function fakeFetch({ linkup, head = () => new Response(null, { status: 200 }) }: Route) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://api.linkup.so/v1/search") {
      if (!linkup) throw new Error("unexpected Linkup call");
      return linkup();
    }
    if (init?.method === "HEAD" || init?.method === "GET") return head(url);
    throw new Error(`unexpected request to ${url}`);
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const answer = (data: unknown, sources: unknown[] = []) => () => Response.json({ data, sources });

function run(input: Parameters<typeof findFormalities>[0], fetch: typeof globalThis.fetch, apiKey = "test-key") {
  return findFormalities(input, { apiKey, fetch, now: () => NOW });
}

describe("findFormalities: Linkup request", () => {
  it("asks for a French passport, with diplomatie.gouv.fr and the destination's government domains", async () => {
    const fetch = fakeFetch({ linkup: answer(BALI_LIVE) });
    await run(BALI, fetch);
    const [, init] = fetch.mock.calls.find(([url]) => String(url).includes("linkup"))!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(body.q).toContain("French passport");
    expect(body.outputType).toBe("structured");
    expect(typeof body.structuredOutputSchema).toBe("string");
    expect(JSON.parse(body.structuredOutputSchema)).toEqual(LINKUP_OUTPUT_SCHEMA);
    expect(body.includeSources).toBe(true);
    expect(body.includeDomains).toEqual(
      expect.arrayContaining(["diplomatie.gouv.fr", "go.id", "evisa.imigrasi.go.id", "lovebali.baliprov.go.id"]),
    );
  });

  it("names the destination country in the query", () => {
    expect(buildQuery({ destination: "Zanzibar", country_iso2: "TZ" })).toContain("Zanzibar, Tanzania");
    expect(buildQuery({ destination: "Japan", country_iso2: "JP" })).toContain("in Japan?");
  });
});

describe("findFormalities: Bali", () => {
  it("shows the live papers with their check time and source, matched to our table", async () => {
    const result = await run(BALI, fakeFetch({ linkup: answer(BALI_LIVE) }));
    expect(result.mode).toBe("live");
    expect(result.fillable).toBe(true);
    expect(result.differs_from_last_check).toBe(false);
    expect(result.formalities.map((f) => f.id)).toEqual(["evoa", "arrival_card", "bali_levy"]);
    for (const f of result.formalities) {
      expect(f.checked_at).toBe(NOW.toISOString());
      expect(f.status).toBe("checked");
      expect(f.sources.length).toBeGreaterThan(0);
      expect(f.link_official).toBe(true);
    }
    expect(result.formalities[0].found_on).toBe("www.diplomatie.gouv.fr");
    expect(result.formalities[1]).toMatchObject({ opens_at: "2026-11-07T14:30+08:00", closes_at: "2026-11-10T14:30+08:00" });
    expect(result.notice).toContain("Matches our last check");
  });

  it("shows the live result with 'differs from our last check' when the cost changed", async () => {
    const changed = structuredClone(BALI_LIVE);
    changed.formalities[2].official_cost = "IDR 200,000";
    const result = await run(BALI, fakeFetch({ linkup: answer(changed) }));
    expect(result.mode).toBe("live");
    expect(result.differs_from_last_check).toBe(true);
    expect(result.formalities[2].official_cost).toBe("IDR 200,000");
    expect(result.formalities[2].differs[0]).toContain("IDR 150,000 on our last check");
    expect(result.notice).toContain("differs from our last check");
  });

  it("says which paper of our table the live answer missed", async () => {
    const partial = { formalities: BALI_LIVE.formalities.slice(0, 2) };
    const result = await run(BALI, fakeFetch({ linkup: answer(partial) }));
    expect(result.missing_from_live).toEqual(["Bali levy"]);
    expect(result.differs_from_last_check).toBe(true);
  });

  it.each([
    ["an HTTP error", () => new Response("boom", { status: 500 })],
    ["a malformed answer", () => Response.json({ answer: "text" })],
    ["no paper at all", () => Response.json({ data: { formalities: [] }, sources: [] })],
  ])("falls back to the hand-verified table, said honestly, on %s", async (_label, linkup) => {
    const result = await run(BALI, fakeFetch({ linkup }));
    expect(result.mode).toBe("fallback");
    expect(result.checked_at).toBeNull();
    expect(result.formalities.map((f) => f.id)).toEqual(["evoa", "arrival_card", "bali_levy"]);
    expect(result.formalities.every((f) => f.checked_at === null && f.status === "suggested")).toBe(true);
    expect(result.notice).toContain("verified by hand on 7 Nov 2026");
  });

  it("falls back when Linkup is slower than the timeout", async () => {
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    ) as unknown as typeof globalThis.fetch;
    const result = await findFormalities(BALI, { apiKey: "k", fetch, now: () => NOW, timeoutMs: 20 });
    expect(result.mode).toBe("fallback");
    expect(result.error).toContain("did not answer within");
  });

  it("falls back without calling Linkup when the key is missing", async () => {
    const fetch = fakeFetch({});
    const result = await findFormalities(BALI, { apiKey: undefined, fetch, now: () => NOW });
    expect(result.mode).toBe("fallback");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("findFormalities: official links (acceptance test 3)", () => {
  const ONE = (official_url: string, source_url = official_url) => ({
    formalities: [
      { name: "Visa", kind: "visa", required: true, official_cost: "USD 50", official_url, when: "Before departure", source_url },
    ],
  });
  const TZ = { destination: "Tanzania", country_iso2: "TZ", arrival_at: null };

  it("accepts a government domain", async () => {
    const result = await run(TZ, fakeFetch({ linkup: answer(ONE("https://visa.immigration.go.tz/apply")) }));
    expect(result.formalities[0]).toMatchObject({ link_official: true, official_url: "https://visa.immigration.go.tz/apply" });
  });

  it.each(["https://gov.example.com/visa", "https://example.com/gov", "https://allindonesia.imigrasi.go.id.evil.com/x"])(
    "refuses %s: marked non-official, not clickable, never HEAD-checked",
    async (url) => {
      const fetch = fakeFetch({ linkup: answer(ONE(url)) });
      const result = await run(TZ, fetch);
      expect(result.formalities[0]).toMatchObject({ link_official: false, official_url: url });
      expect(result.formalities[0].sources).toEqual([{ url, official: false }]);
      expect(fetch.mock.calls.some(([u]) => String(u) === url)).toBe(false);
    },
  );

  it("marks non-official sources in the answer", async () => {
    const result = await run(
      TZ,
      fakeFetch({
        linkup: answer(ONE("https://visa.immigration.go.tz/apply"), [
          { name: "Diplomatie", url: "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/" },
          { name: "Agency", url: "https://tanzania-visa-online.com/" },
        ]),
      }),
    );
    expect(result.sources).toEqual([
      { url: "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/", official: true },
      { url: "https://tanzania-visa-online.com/", official: false },
    ]);
  });

  it("replaces an official_url whose HEAD request fails by the home page of its domain", async () => {
    const deep = "https://visa.immigration.go.tz/old/page";
    const result = await run(
      TZ,
      fakeFetch({ linkup: answer(ONE(deep)), head: (u) => new Response(null, { status: u === deep ? 404 : 200 }) }),
    );
    expect(result.formalities[0]).toMatchObject({
      official_url: "https://visa.immigration.go.tz/",
      link_official: true,
      link_replaced: true,
    });
    expect(result.formalities[0].sources.map((s) => s.url)).toContain(deep);
  });

  it("never offers automatic filling outside Bali", async () => {
    const result = await run(TZ, fakeFetch({ linkup: answer(ONE("https://visa.immigration.go.tz/apply")) }));
    expect(result.fillable).toBe(false);
    expect(result.notice).toContain("Automatic filling is validated country by country; Bali is the first.");
  });

  it("has no invented list outside Bali when Linkup fails", async () => {
    const result = await run(TZ, fakeFetch({ linkup: () => new Response(null, { status: 503 }) }));
    expect(result.mode).toBe("unavailable");
    expect(result.formalities).toEqual([]);
    expect(result.notice).toContain("diplomatie.gouv.fr");
  });

  it("keeps an unknown cost as unknown", async () => {
    const data = ONE("https://visa.immigration.go.tz/apply");
    data.formalities[0].official_cost = "Not specified in the sources";
    const result = await run(TZ, fakeFetch({ linkup: answer(data) }));
    expect(result.formalities[0].official_cost).toBe("Not stated on the source");
  });
});

describe("costAmount", () => {
  it.each([
    ["IDR 500,000", 500000],
    ["IDR 500.000", 500000],
    ["Rp 150 000", 150000],
    ["Free", 0],
    ["Not stated on the source", null],
  ])("%s -> %s", (cost, amount) => {
    expect(costAmount(cost)).toBe(amount);
  });
});

describe("findFormalities: Linkup wording wins over its own flags", () => {
  const JP = { destination: "Japan", country_iso2: "JP", arrival_at: null };
  const item = (over: Record<string, unknown>) => ({
    name: "Visa",
    kind: "visa",
    required: true,
    official_cost: "Free",
    official_url: "https://www.mofa.go.jp/j_info/visit/visa/index.html",
    when: "Before departure",
    source_url: "https://www.diplomatie.gouv.fr/fr/information-par-pays/japon/conseils-aux-voyageurs-entree-sejour",
    ...over,
  });

  it.each([
    { official_cost: "Free (no visa required)" },
    { when: "Optional; recommended before arrival" },
    { name: "Visa exemption for French passport holders" },
    { required: false },
  ])("marks %o as not required", async (over) => {
    const result = await run(JP, fakeFetch({ linkup: answer({ formalities: [item(over)] }) }));
    expect(result.formalities[0].required).toBe(false);
  });

  it("keeps an unknown cost written in French as unknown", async () => {
    const result = await run(JP, fakeFetch({ linkup: answer({ formalities: [item({ official_cost: "Non indiqué dans les sources" })] }) }));
    expect(result.formalities[0].official_cost).toBe("Not stated on the source");
  });
});

describe("findFormalities: Bali cost not stated live", () => {
  it("shows the cost of our last check, said as such, without calling it a difference", async () => {
    const unknown = structuredClone(BALI_LIVE);
    unknown.formalities[1].official_cost = "Not stated";
    const result = await run(BALI, fakeFetch({ linkup: answer(unknown) }));
    expect(result.formalities[1].official_cost).toBe("Free (not stated live; our last check)");
    expect(result.formalities[1].differs).toEqual([]);
    expect(result.differs_from_last_check).toBe(false);
  });
});
