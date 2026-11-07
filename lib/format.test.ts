import { describe, expect, it } from "vitest";
import { formatLocalDateTime } from "@/lib/format";

describe("formatLocalDateTime", () => {
  it("keeps the destination's own time", () => {
    expect(formatLocalDateTime("2026-11-16T10:00+00:00")).toBe("Mon 16 Nov, 10:00");
    expect(formatLocalDateTime("2026-11-10T14:30+08:00")).toBe("Tue 10 Nov, 14:30");
    expect(formatLocalDateTime("2026-11-16T22:30-04:00")).toBe("Mon 16 Nov, 22:30");
    expect(formatLocalDateTime("2026-11-16T23:30Z")).toBe("Mon 16 Nov, 23:30");
  });
});
