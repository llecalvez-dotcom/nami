import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/access/route";
import { resetGuards } from "@/lib/api-guard";

const call = (code: string, headers: HeadersInit = {}) =>
  POST(new Request("http://localhost/api/access", { method: "POST", headers, body: JSON.stringify({ code }) }));

beforeEach(() => {
  resetGuards();
  vi.stubEnv("NAMI_ACCESS_CODE", "specimen access code");
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/access", () => {
  it("sets the secure HMAC cookie for the correct code", async () => {
    const response = await call("specimen access code");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("nami_access=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=43200");
  });

  it("rejects an incorrect code", async () => {
    expect((await call("incorrect")).status).toBe(401);
  });

  it("limits attempts by IP even when the cookie changes", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(
        (
          await call("wrong", {
            cookie: `nami_access=fake-${attempt}`,
            "x-forwarded-for": "192.0.2.7, 10.0.0.1",
          })
        ).status,
      ).toBe(401);
    }
    expect(
      (
        await call("wrong", {
          cookie: "nami_access=fake-10",
          "x-forwarded-for": "192.0.2.7, 10.0.0.1",
        })
      ).status,
    ).toBe(429);
  });
});
