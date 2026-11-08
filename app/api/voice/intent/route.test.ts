import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteJson } from "@/lib/llm";
import { API_LIMITS, resetGuards } from "@/lib/api-guard";

const complete = vi.fn<CompleteJson>();
vi.mock("@/lib/llm", () => ({ completeJson: () => complete }));

const { POST } = await import("@/app/api/voice/intent/route");

const question = {
  kind: "proposal",
  text: "Do you also want me to help you find your flights?",
  options: [
    { id: "accept", label: "Yes, find my flights" },
    { id: "decline", label: "Not now" },
  ],
};

function call(body: unknown, headers: HeadersInit = {}) {
  return POST(new Request("http://localhost/api/voice/intent", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
}

beforeEach(() => {
  resetGuards();
  complete.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("POST /api/voice/intent", () => {
  it("returns the intent read by the model", async () => {
    complete.mockResolvedValue(JSON.stringify({ intent: "accept", option_ids: "", confidence: "high" }));
    const response = await call({ transcript: "ouais je suis chaud", language: "fr", question });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "accept", confidence: 0.9 });
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^voice\/intent "ouais je suis chaud" → accept \(0\.9\) \d+ ms$/));
  });

  it("answers the closed lists without the model", async () => {
    const response = await call({ transcript: "non merci", question });
    expect(await response.json()).toEqual({ kind: "decline", confidence: 1 });
    expect(complete).not.toHaveBeenCalled();
  });

  it("rejects a body that does not match the schema", async () => {
    expect((await call({ transcript: "", question })).status).toBe(400);
    expect((await call({ transcript: "oui", language: "fr-FR", question })).status).toBe(400);
    expect((await call({ transcript: "oui", question: { ...question, kind: "other" } })).status).toBe(400);
    expect((await call("not json")).status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it("is guarded by size and quota", async () => {
    const tooLarge = await call({ transcript: "oui", question }, { "content-length": String(API_LIMITS.intent + 1) });
    expect(tooLarge.status).toBe(413);
    for (let i = 0; i < 200; i++) await call({ transcript: "oui", question });
    expect((await call({ transcript: "oui", question })).status).toBe(429);
  });

  it("answers free when the model fails", async () => {
    complete.mockRejectedValue(new Error("H Models API returned 500"));
    const response = await call({ transcript: "hmm je sais pas trop", language: "fr", question });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "free", text: "hmm je sais pas trop", confidence: 0 });
  });
});
