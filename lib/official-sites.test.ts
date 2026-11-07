import { describe, expect, it } from "vitest";
import { BALI_PAPERS } from "@/lib/bali-papers";
import { isOfficialUrl, isWhitelistedUrl } from "@/lib/official-sites";

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
