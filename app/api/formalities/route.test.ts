import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/formalities/route";

function call(body: unknown) {
  return POST(new Request("http://localhost/api/formalities", { method: "POST", body: JSON.stringify(body) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/formalities", () => {
  it("rejects an invalid request", async () => {
    expect((await call({ destination: "Bali", country_iso2: "indonesia" })).status).toBe(400);
  });

  it("returns the live papers found by Linkup", async () => {
    vi.stubEnv("LINKUP_API_KEY", "test-key");
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("linkup")
        ? Response.json({
            data: {
              formalities: [
                {
                  name: "eVisa",
                  kind: "visa",
                  required: true,
                  official_cost: "USD 50",
                  official_url: "https://visa.immigration.go.tz/",
                  when: "Before departure",
                  source_url: "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/conseils-par-pays-destination/tanzanie/",
                },
              ],
            },
            sources: [{ name: "Tanzanie", url: "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/" }],
          })
        : new Response(null, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    const response = await call({ destination: "Tanzania", country_iso2: "TZ" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ mode: "live", country_name: "Tanzania", fillable: false });
    expect(body.formalities[0]).toMatchObject({ name: "eVisa", official_cost: "USD 50", found_on: "www.diplomatie.gouv.fr" });
  });

  it("shows the hand-verified Bali table honestly when no key is set", async () => {
    vi.stubEnv("LINKUP_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const body = await (await call({ destination: "Bali", country_iso2: "ID", arrival_at: "2026-11-10T14:30+08:00" })).json();
    expect(body.mode).toBe("fallback");
    expect(body.formalities).toHaveLength(3);
    expect(body.notice).toContain("verified by hand on 7 Nov 2026");
    expect(fetch).not.toHaveBeenCalled();
  });
});
