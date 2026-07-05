/**
 * Stop-verify decision engine: oracle-driven verification loop with trust gating.
 * Pure decision logic — the shim/CLI supplies file contents, git-tracked status,
 * and an oracle runner; this module decides what happens next.
 *
 * Security model (unchanged from 2.6): the oracle is executed via the shell, so
 * the loop file is dangerous input. It is refused unless BOTH:
 *   1. it contains `"trusted": true` (written by the /loop command), and
 *   2. it is NOT tracked in git (a committed loop file in a cloned repo is the attack vector).
 */

export const DEFAULT_TIMEOUT_SECONDS = 600;
export const DEFAULT_MAX_OUTPUT = 6000;
export const STALL_THRESHOLD = 3;

export interface LoopState {
  trusted?: unknown;
  created_by?: string;
  oracle: string;
  max_iterations: number;
  timeout_seconds?: number;
  max_output?: number;
  goal?: string;
  // managed fields
  iteration?: number;
  last_failure_sig?: string;
  failure_streak?: number;
}

export interface OracleResult {
  passed: boolean;
  output: string;
  startedAt: string;
  endedAt: string;
}

export type StopDecision =
  | { kind: "allow-stop" }
  | { kind: "allow-stop-with-message"; message: string; deleteLoopFile: boolean }
  | { kind: "run-oracle"; timeoutSeconds: number }
  | { kind: "block"; reason: string; newState: LoopState };

/** Parse and structurally validate a loop file. Returns null when invalid. */
export function parseLoopState(raw: unknown): LoopState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj["oracle"] !== "string" || obj["oracle"].length === 0) return null;
  const maxIter = Number(obj["max_iterations"]);
  if (!Number.isFinite(maxIter)) return null;
  return { ...(obj as object), oracle: obj["oracle"], max_iterations: maxIter } as LoopState;
}

/** The trust gate. Returns a refusal message, or null when trusted. */
export function trustRefusal(
  state: LoopState,
  gitTracked: boolean,
  relPath: string,
): string | null {
  if (state.trusted !== true || gitTracked) {
    const reason =
      state.trusted !== true
        ? 'missing "trusted": true'
        : "the loop file is tracked in git (possible untrusted repo content)";
    return `⚠️ maaaw-kit refused to execute the verification-loop oracle in ${relPath}: ${reason}. The oracle was NOT run. If this loop is yours, recreate it via /loop (which writes a trusted, untracked file); otherwise delete the file — treat loop configs from cloned repos as untrusted.`;
  }
  return null;
}

/** Budget check before running the oracle. Returns exhaustion message or null. */
export function budgetExhausted(state: LoopState): string | null {
  const iteration = state.iteration ?? 0;
  if (state.max_iterations <= 0 || iteration >= state.max_iterations) {
    return `Loop budget exhausted (${iteration}/${state.max_iterations}). Stopping. Report remaining failures honestly — do not claim success.`;
  }
  return null;
}

/** A stable signature for the failure output, for stall detection. */
export async function failureSignature(output: string): Promise<string> {
  const tail = output.slice(-2000);
  const data = new TextEncoder().encode(tail);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

/** Decide what happens after the oracle ran. */
export async function afterOracle(state: LoopState, result: OracleResult): Promise<StopDecision> {
  const iteration = state.iteration ?? 0;
  const maxOut = state.max_output ?? DEFAULT_MAX_OUTPUT;

  if (result.passed) {
    return {
      kind: "allow-stop-with-message",
      deleteLoopFile: true,
      message: `✅ Loop complete: oracle passed after ${iteration} fix iteration(s) [${result.startedAt}–${result.endedAt}].\nOracle: ${state.oracle}\n${result.output.slice(-1500)}`,
    };
  }

  const sig = await failureSignature(result.output);
  const same = state.last_failure_sig === sig;
  const streak = same ? (state.failure_streak ?? 0) + 1 : 1;
  const newState: LoopState = {
    ...state,
    iteration: iteration + 1,
    last_failure_sig: sig,
    failure_streak: streak,
  };

  const stall =
    streak >= STALL_THRESHOLD
      ? `\n⚠️ STALLED: this exact failure has now survived ${streak} consecutive iterations. Stop patching — re-read the full output, question the layer (test? spec? approach?), and re-plan (deep-thinking skill step 3) before the next attempt.`
      : "";
  const goal = state.goal ? `GOAL: ${state.goal}\n` : "";
  const tail = result.output.slice(-maxOut);

  return {
    kind: "block",
    newState,
    reason: `🔄 Verification loop — iteration ${iteration + 1}/${state.max_iterations} [oracle ran ${result.startedAt}–${result.endedAt}].\n${goal}ORACLE: ${state.oracle}\n--- oracle output (tail) ---\n${tail}\n--- end ---\n${stall}\nPick the FIRST/most-upstream failure, smallest real fix, never skip/delete tests or loosen assertions. Commit each improvement. To cancel: delete the loop file and explain why.`,
  };
}
