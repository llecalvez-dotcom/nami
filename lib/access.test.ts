import { describe, expect, it } from "vitest";
import { accessToken, constantTimeEqual } from "@/lib/access";

describe("access helpers", () => {
  it("creates a stable HMAC-SHA256 token", async () => {
    const first = await accessToken("specimen access code");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await accessToken("specimen access code")).toBe(first);
    expect(await accessToken("another specimen code")).not.toBe(first);
  });

  it("compares equal and unequal strings without an early equality check", () => {
    expect(constantTimeEqual("same-value", "same-value")).toBe(true);
    expect(constantTimeEqual("same-value", "other-value")).toBe(false);
    expect(constantTimeEqual("short", "longer")).toBe(false);
  });
});
