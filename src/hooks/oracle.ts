import { execa } from "execa";

function clock(): string {
  return new Date().toTimeString().slice(0, 8);
}

export interface TrustedOracleRun {
  passed: boolean;
  exitCode: number | null;
  output: string;
  startedAt: string;
  endedAt: string;
}

export async function runTrustedOracle(
  oracle: string,
  cwd: string,
  timeoutMs: number,
): Promise<TrustedOracleRun> {
  const startedAt = clock();
  try {
    const result = await execa(oracle, {
      cwd,
      shell: true,
      timeout: timeoutMs,
      reject: false,
      all: true,
    });
    if (result.timedOut) {
      return {
        passed: false,
        exitCode: null,
        output: `Oracle timed out after ${Math.round(timeoutMs / 1000)}s: ${oracle}`,
        startedAt,
        endedAt: clock(),
      };
    }
    return {
      passed: result.exitCode === 0,
      exitCode: result.exitCode ?? null,
      output: (result.all ?? "").trim(),
      startedAt,
      endedAt: clock(),
    };
  } catch (e) {
    return {
      passed: false,
      exitCode: null,
      output: `Oracle failed to run: ${(e as Error).message}`,
      startedAt,
      endedAt: clock(),
    };
  }
}
