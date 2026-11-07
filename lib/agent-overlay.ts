import type { AgentRun } from "@/lib/contracts";
import { redact } from "@/lib/agent-changes";
import { isTerminalStatus } from "@/lib/h-agent";

export function agentStateMessage(run: AgentRun | null, steps: readonly string[], secrets: readonly (string | null | undefined)[] = []) {
  return {
    type: "nami:agent-state" as const,
    active: run !== null && !run.drained && !run.pending_question && !isTerminalStatus(run.state),
    step: run ? redact(steps.at(-1) ?? "", secrets).replace(/[–—]/g, ", ") : "",
  };
}

type Host = { parent: Pick<Window, "postMessage"> };

export function postAgentState(message: ReturnType<typeof agentStateMessage>, host: Host = window) {
  if ((host.parent as unknown) !== host) host.parent.postMessage(message, "*");
}
