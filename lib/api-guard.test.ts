import { beforeEach, describe, expect, it } from "vitest";
import { API_LIMITS, guard, readJsonLimited, resetGuards } from "@/lib/api-guard";

const request = (headers: HeadersInit = {}) => new Request("http://localhost/api/test", { headers });

function lease(result: Response | { release: () => void }) {
  if (result instanceof Response) throw new Error("Expected guard to allow the request.");
  return result;
}

beforeEach(() => {
  resetGuards();
});

describe("api guard size limits", () => {
  it("rejects a declared content length over the route limit", () => {
    const result = guard(request({ "content-length": String(API_LIMITS.parse + 1) }), "parse");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });

  it("checks the actual JSON text size", async () => {
    const result = await readJsonLimited(new Request("http://localhost", { method: "POST", body: "1234" }), 3);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });
});

describe("api guard quotas", () => {
  it("rolls a fixed-window quota over after ten minutes", () => {
    let timestamp = 1000;
    const sameClient = request({ cookie: "nami_access=client-token" });
    for (let count = 0; count < 30; count++) lease(guard(sameClient, "parse", () => timestamp)).release();
    const blocked = guard(sameClient, "parse", () => timestamp);
    expect(blocked).toBeInstanceOf(Response);
    expect((blocked as Response).status).toBe(429);
    expect((blocked as Response).headers.get("Retry-After")).toBe("600");

    timestamp += 10 * 60 * 1000;
    lease(guard(sameClient, "parse", () => timestamp)).release();
  });

  it("uses the access cookie before the forwarded IP for client identity", () => {
    const fromCookie = request({ cookie: "nami_access=client-token", "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    const fromIp = request({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    for (let count = 0; count < 20; count++) lease(guard(fromCookie, "formalities")).release();

    const blockedCookieClient = guard(fromCookie, "formalities");
    const separateIpClient = guard(fromIp, "formalities");
    expect(blockedCookieClient).toBeInstanceOf(Response);
    expect((blockedCookieClient as Response).status).toBe(429);
    expect(separateIpClient).not.toBeInstanceOf(Response);
    lease(separateIpClient).release();
  });
});

describe("api guard concurrency", () => {
  it("blocks at the route limit and releases capacity after a thrown error", async () => {
    const requestWithCookie = request({ cookie: "nami_access=extract-client" });
    const first = lease(guard(requestWithCookie, "extract"));
    const busy = guard(requestWithCookie, "extract");
    expect(busy).toBeInstanceOf(Response);
    expect((busy as Response).status).toBe(429);
    await expect((busy as Response).json()).resolves.toEqual({ error: "Busy, try again in a moment." });

    expect(() => {
      try {
        throw new Error("simulated route failure");
      } finally {
        first.release();
      }
    }).toThrow("simulated route failure");
    lease(guard(requestWithCookie, "extract")).release();
  });
});
