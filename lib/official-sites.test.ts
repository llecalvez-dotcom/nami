import { describe, expect, it, vi } from "vitest";
import { BALI_PAPERS } from "@/lib/bali-papers";
import { checkOfficialLink, governmentDomainsFor, isOfficialUrl, isWhitelistedUrl } from "@/lib/official-sites";

describe("isOfficialUrl", () => {
  it.each([
    "https://allindonesia.imigrasi.go.id/x",
    "https://evisa.imigrasi.go.id",
    "https://lovebali.baliprov.go.id/faq",
    "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/",
    "https://travel.state.gov/content/travel.html",
  ])("accepts %s", (url) => {
    expect(isOfficialUrl(url)).toBe(true);
  });

  it.each([
    "https://gov.example.com",
    "https://example.com/gov",
    "https://allindonesia.imigrasi.go.id.evil.com",
    "https://evil-go.id.com",
    "https://go.id",
    "not a url",
    "ftp://evisa.imigrasi.go.id",
  ])("rejects %s", (url) => {
    expect(isOfficialUrl(url)).toBe(false);
  });
});

describe("isWhitelistedUrl", () => {
  it("accepts the observed Indonesian hosts only for ID", () => {
    expect(isWhitelistedUrl("https://evisa.imigrasi.go.id/web/visa-selection", "ID")).toBe(true);
    expect(isWhitelistedUrl("https://evisa.imigrasi.go.id/web/visa-selection", "FR")).toBe(false);
    expect(isWhitelistedUrl("https://other.imigrasi.go.id", "ID")).toBe(false);
  });

  it("covers every Bali paper URL", () => {
    for (const paper of BALI_PAPERS) {
      expect(isWhitelistedUrl(paper.official_url, "ID")).toBe(true);
      expect(new URL(paper.official_url).hostname).toBe(paper.domain);
    }
  });
});

describe("governmentDomainsFor", () => {
  it("always includes diplomatie.gouv.fr and the country's government second-level domains", () => {
    expect(governmentDomainsFor("ID")).toEqual(
      expect.arrayContaining(["diplomatie.gouv.fr", "go.id", "evisa.imigrasi.go.id", "allindonesia.imigrasi.go.id"]),
    );
    expect(governmentDomainsFor("TZ")).toEqual(expect.arrayContaining(["diplomatie.gouv.fr", "go.tz"]));
    expect(governmentDomainsFor("GB")).toContain("gov.uk");
  });
});

describe("checkOfficialLink", () => {
  const status = (code: number) => vi.fn(async () => new Response(null, { status: code })) as unknown as typeof fetch;

  it("keeps an official URL that answers", async () => {
    const url = "https://evisa.imigrasi.go.id/web/visa-selection";
    expect(await checkOfficialLink(url, { fetch: status(200) })).toEqual({ url, official: true, replaced: false });
  });

  it("replaces an official URL whose HEAD fails by the home page of its domain", async () => {
    expect(await checkOfficialLink("https://evisa.imigrasi.go.id/old", { fetch: status(404) })).toEqual({
      url: "https://evisa.imigrasi.go.id/",
      official: true,
      replaced: true,
    });
    const unreachable = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect((await checkOfficialLink("https://lovebali.baliprov.go.id/x", { fetch: unreachable })).url).toBe(
      "https://lovebali.baliprov.go.id/",
    );
  });

  it("retries with GET when HEAD is not allowed", async () => {
    const fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => new Response(null, { status: init?.method === "HEAD" ? 405 : 200 }));
    const url = "https://allindonesia.imigrasi.go.id/";
    expect(await checkOfficialLink(url, { fetch: fetch as unknown as typeof globalThis.fetch })).toMatchObject({ replaced: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never requests a non-official URL", async () => {
    const fetch = status(200);
    expect(await checkOfficialLink("https://gov.example.com/visa", { fetch })).toEqual({
      url: "https://gov.example.com/visa",
      official: false,
      replaced: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("checkOfficialLink on a home page", () => {
  it("does not call a home page that fails 'replaced'", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof globalThis.fetch;
    expect(await checkOfficialLink("https://www.mofa.go.jp/", { fetch })).toEqual({
      url: "https://www.mofa.go.jp/",
      official: true,
      replaced: false,
    });
  });
});
