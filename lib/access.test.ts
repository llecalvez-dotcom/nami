import { describe, expect, it } from "vitest";
import { accessToken, constantTimeEqual, safeNext } from "@/lib/access";

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

  it("keeps a same-origin destination", () => {
    expect(safeNext("/trip/x?demo=1", "https://nami.example")).toBe("/trip/x?demo=1");
  });

  it("rejects destinations that leave the current origin", () => {
    for (const next of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)"]) {
      expect(safeNext(next, "https://nami.example")).toBe("/");
    }
  });

  it("defaults missing or invalid destinations to the home page", () => {
    expect(safeNext(null, "https://nami.example")).toBe("/");
    expect(safeNext("/trip/x", "not a valid origin")).toBe("/");
  });
});
