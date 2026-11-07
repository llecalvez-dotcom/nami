import { beforeEach, describe, expect, it } from "vitest";
import { API_LIMITS, guard, quotaEntryCount, readJsonLimited, resetGuards } from "@/lib/api-guard";

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
    const chunks = Array.from({ length: 9 }, () => new Uint8Array(2048));
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const streamed = new Request("http://localhost", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    const result = await readJsonLimited(streamed, API_LIMITS.parse);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
    expect(cancelled).toBe(true);
  });

  it("parses a small streamed JSON body and treats a null body as null", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":'));
        controller.enqueue(new TextEncoder().encode("true}"));
        controller.close();
      },
    });
    const streamed = new Request("http://localhost", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    expect(await readJsonLimited(streamed, 32)).toEqual({ value: { ok: true } });
    expect(await readJsonLimited(new Request("http://localhost"), 32)).toEqual({ value: null });
  });

  it("requires content length on multipart routes", () => {
    const requestWithoutLength = request({ "content-type": "multipart/form-data; boundary=test" });
    expect(guard(requestWithoutLength, "extract")).toBeInstanceOf(Response);
    expect((guard(requestWithoutLength, "transcribe") as Response).status).toBe(411);
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

  it("prunes expired entries when the quota map reaches 1000 entries", () => {
    let timestamp = 1000;
    for (let index = 0; index < 1000; index++) {
      const ip = `192.0.${Math.floor(index / 256)}.${index % 256}`;
      lease(guard(request({ "x-forwarded-for": ip }), "parse", () => timestamp)).release();
    }
    expect(quotaEntryCount()).toBe(1000);

    timestamp += 10 * 60 * 1000 + 1;
    lease(guard(request({ "x-forwarded-for": "203.0.113.10" }), "parse", () => timestamp)).release();
    expect(quotaEntryCount()).toBe(1);
  });
});

describe("api guard concurrency", () => {
  it("blocks at the route limit and releases capacity after a thrown error", async () => {
    const requestWithCookie = request({ cookie: "nami_access=extract-client", "content-length": "0" });
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
