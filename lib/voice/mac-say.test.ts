import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { macSayEnabled, MAX_SAY_CHARS, say, sayArgs } from "@/lib/voice/mac-say";

describe("Nami's voice through the Mac's speakers", () => {
  it("is local only: never in production nor off a Mac", () => {
    expect(macSayEnabled({ NODE_ENV: "development" }, "darwin")).toBe(true);
    expect(macSayEnabled({ NODE_ENV: "production" }, "darwin")).toBe(false);
    expect(macSayEnabled({ NODE_ENV: "development" }, "linux")).toBe(false);
    expect(macSayEnabled({ NODE_ENV: "development", NAMI_MAC_VOICE: "off" }, "darwin")).toBe(false);
  });

  it("passes the text as one argument after --, with the voice of the language, never through a shell", () => {
    expect(sayArgs("Bonjour; rm -rf ~", "fr")).toEqual(["-v", "Thomas", "--", "Bonjour; rm -rf ~"]);
    expect(sayArgs("-v Evil", "xx")).toEqual(["--", "-v Evil"]);
    expect(sayArgs("a".repeat(MAX_SAY_CHARS + 50), "en")[3]).toHaveLength(MAX_SAY_CHARS);
  });

  it("answers once the line is said", async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    const run = vi.fn(() => {
      setTimeout(() => child.emit("close", 0), 1);
      return child;
    });
    expect(await say("Oui", "fr", run as never)).toBe(true);
    expect(run).toHaveBeenCalledWith("say", ["-v", "Thomas", "--", "Oui"], { stdio: "ignore" });
  });
});
