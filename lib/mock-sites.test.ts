import { describe, expect, it } from "vitest";
import { baliPapers } from "@/lib/bali-papers";
import { mockDomains, mockSitesEnabled, mockSitesPort, mockSiteUrl } from "@/lib/mock-sites";

describe("mock official sites (ticket 0)", () => {
  it("are off by default and impossible in production", () => {
    expect(mockSitesEnabled({})).toBe(false);
    expect(mockSitesEnabled({ NAMI_MOCK_SITES: "on" })).toBe(true);
    expect(mockSitesEnabled({ NAMI_MOCK_SITES: "on", NODE_ENV: "production" })).toBe(false);
    expect(mockSitesEnabled({ NAMI_MOCK_SITES: "yes" })).toBe(false);
    expect(mockDomains({})).toEqual([]);
    expect(mockDomains({ NAMI_MOCK_SITES: "on" })).toEqual(["evoa.test.localhost", "allindonesia.test.localhost"]);
  });

  it("serve on 3100 unless told otherwise", () => {
    expect(mockSitesPort({})).toBe(3100);
    expect(mockSitesPort({ NAMI_MOCK_SITES_PORT: "4000" })).toBe(4000);
    expect(mockSiteUrl("evoa", "/web/visa-selection", { NAMI_MOCK_SITES_PORT: "4000" })).toBe("http://evoa.test.localhost:4000/web/visa-selection");
  });

  it("replace the real e-VOA and arrival card sites in the papers, and only them, only when on", () => {
    const real = baliPapers({});
    expect(real.find((p) => p.id === "evoa")?.domain).toBe("evisa.imigrasi.go.id");
    const mocked = baliPapers({ NAMI_MOCK_SITES: "on" });
    const evoa = mocked.find((p) => p.id === "evoa")!;
    expect(evoa.domain).toBe("evoa.test.localhost");
    expect(evoa.official_url).toBe("http://evoa.test.localhost:3100/web/visa-selection");
    const card = mocked.find((p) => p.id === "arrival_card")!;
    expect(card.domain).toBe("allindonesia.test.localhost");
    expect(card.official_url).toBe("http://allindonesia.test.localhost:3100/arrival-card-submission/personal-information");
    expect(mocked.find((p) => p.id === "bali_levy")?.domain).toBe("lovebali.baliprov.go.id");
    // The rules of the paper (forbidden buttons, stop condition, route) are the real ones: the mock is judged like the site.
    expect(evoa.stop_condition).toBe(real.find((p) => p.id === "evoa")!.stop_condition);
    expect(baliPapers({ NAMI_MOCK_SITES: "on", NODE_ENV: "production" })).toEqual(real);
  });
});
