import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeJson, H_ATTEMPTS_MS } from "@/lib/llm";

const INPUT = { system: "s", user: "u", schema: {} };
const answer = (content: string) => Response.json({ choices: [{ message: { content } }] });
const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

beforeEach(() => {
  vi.stubEnv("HAI_API_KEY", "h-key");
  vi.stubEnv("LLM_PROVIDER", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("H text model", () => {
  it("answers on the first try without a second call", async () => {
    const fetch = vi.fn(async () => answer("{}"));
    vi.stubGlobal("fetch", fetch);
    expect(await completeJson()(INPUT)).toBe("{}");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("tries once more after a timeout, a network error or a 5xx", async () => {
    for (const failure of [timeout(), new TypeError("fetch failed"), null]) {
      const fetch = vi.fn()
        .mockImplementationOnce(async () => {
          if (failure) throw failure;
          return new Response("busy", { status: 503 });
        })
        .mockResolvedValueOnce(answer("{\"ok\":true}"));
      vi.stubGlobal("fetch", fetch);
      expect(await completeJson()(INPUT)).toBe("{\"ok\":true}");
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  });

  it("gives up after two tries, within 18 s in all", async () => {
    const fetch = vi.fn(async () => {
      throw timeout();
    });
    vi.stubGlobal("fetch", fetch);
    await expect(completeJson()(INPUT)).rejects.toThrow("timeout");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(H_ATTEMPTS_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(18_000);
  });

  it("never retries a 4xx: the request itself is wrong", async () => {
    const fetch = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    await expect(completeJson()(INPUT)).rejects.toThrow("returned 400");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
