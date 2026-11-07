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

describe("API access proxy", () => {
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

  it("skips the access-code endpoint", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/access"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed when access is unset in production", async () => {
    vi.stubEnv("NAMI_ACCESS_CODE", "");
    const response = await proxy(new NextRequest("http://localhost/api/formalities"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Access is not configured." });
  });
});
