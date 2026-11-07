import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { accessToken } from "@/lib/access";
import { proxy } from "@/proxy";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NAMI_ACCESS_CODE", "specimen access code");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("access proxy", () => {
  it("requires the HMAC cookie for API routes", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/formalities"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Access code required. Open /access." });
  });

  it("allows a request with the matching cookie", async () => {
    const token = await accessToken("specimen access code");
    const response = await proxy(
      new NextRequest("http://localhost/api/formalities", { headers: { cookie: `nami_access=${token}` } }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("puts the visa agent routes behind the access cookie", async () => {
    const token = await accessToken("specimen access code");
    for (const path of ["/api/papers/start", "/api/agent/s-1/changes?from_index=0", "/api/agent/s-1/answer", "/api/agent/s-1/cancel"]) {
      expect((await proxy(new NextRequest(`http://localhost${path}`))).status).toBe(401);
      const allowed = await proxy(new NextRequest(`http://localhost${path}`, { headers: { cookie: `nami_access=${token}` } }));
      expect(allowed.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("skips the access-code endpoint", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/access"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects a page without a valid cookie and preserves its destination", async () => {
    const response = await proxy(new NextRequest("http://localhost/trip/123?demo=1"));
    expect(response.status).toBe(307);
    const redirect = new URL(response.headers.get("location") ?? "http://localhost");
    expect(redirect.pathname).toBe("/access");
    expect(redirect.searchParams.get("next")).toBe("/trip/123?demo=1");
  });

  it("allows a page with the matching cookie", async () => {
    const token = await accessToken("specimen access code");
    const response = await proxy(
      new NextRequest("http://localhost/trip/123", { headers: { cookie: `nami_access=${token}` } }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not redirect the access page itself", async () => {
    const response = await proxy(new NextRequest("http://localhost/access?next=%2Ftrip%2F123"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed when access is unset in production", async () => {
    vi.stubEnv("NAMI_ACCESS_CODE", "");
    const response = await proxy(new NextRequest("http://localhost/api/formalities"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Access is not configured." });
  });

  it("allows pages when access is unset in production", async () => {
    vi.stubEnv("NAMI_ACCESS_CODE", "");
    const response = await proxy(new NextRequest("http://localhost/"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
