import { describe, expect, it, vi } from "vitest";
import { linkupStructuredSearch, LinkupError } from "@/lib/linkup";

const input = {
  q: "q",
  schema: { type: "object" },
  includeDomains: ["diplomatie.gouv.fr"],
};
const ok = () => Response.json({ data: { formalities: [] }, sources: [] });

describe("linkupStructuredSearch retry", () => {
  it("retries once after a 400 and returns the second answer", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad", { status: 400 }))
      .mockResolvedValueOnce(ok());
    const answer = await linkupStructuredSearch(input, {
      apiKey: "k",
      timeoutMs: 15_000,
      fetch,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(answer.data).toEqual({ formalities: [] });
  });

  it("gives up after two failures", async () => {
    const fetch = vi.fn(async () => new Response("down", { status: 503 }));
    await expect(
      linkupStructuredSearch(input, { apiKey: "k", timeoutMs: 15_000, fetch }),
    ).rejects.toThrow(LinkupError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 401", async () => {
    const fetch = vi.fn(async () => new Response("no", { status: 401 }));
    await expect(
      linkupStructuredSearch(input, { apiKey: "k", timeoutMs: 15_000, fetch }),
    ).rejects.toThrow("Linkup returned 401");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
