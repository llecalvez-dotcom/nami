import { describe, expect, it } from "vitest";
import { AgentAnswerSchema, PAPER_ANSWER_FORMAT, parseAgentAnswer } from "@/lib/agent-answer";

describe("structured agent answers", () => {
  it("requires only a summary and describes optional form fields", () => {
    expect(PAPER_ANSWER_FORMAT).toMatchObject({
      type: "object", required: ["summary"], additionalProperties: false,
      properties: { summary: { type: "string" }, filled_fields: { type: "array" }, missing_fields: { type: "array" } },
    });
    expect(AgentAnswerSchema.parse({ summary: "Filled the form" })).toEqual({ summary: "Filled the form" });
  });

  it("accepts an object or its wire JSON representation", () => {
    const answer = { summary: "Stopped", filled_fields: ["surname"], missing_fields: [], blocked_reason: null };
    expect(parseAgentAnswer(answer)).toEqual(answer);
    expect(parseAgentAnswer(JSON.stringify(answer))).toEqual(answer);
  });

  it.each([null, "", "Plain legacy answer", "{broken", {}, { summary: " " }, { summary: 42 },
    { summary: "Stopped", filled_fields: [42] }, { summary: "Stopped", unexpected: true }])("rejects invalid answers safely: %j", (answer) => {
    expect(parseAgentAnswer(answer)).toBeNull();
  });
});
