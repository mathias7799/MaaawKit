/**
 * `.agent/` state manager — vendor-neutral repo-local state with atomic,
 * lock-protected writes. Layout (roadmap §5):
 *
 *   .agent/kit.json          KitConfig
 *   .agent/bridge/jobs/      JobRecord JSON files
 *   .agent/bridge/logs/      job logs (gitignored)
 *   .agent/bridge/results/   worker result markdown + patches
 *   .agent/bridge/adapters.json  user adapter overrides
 *   .agent/memory/records/   one markdown record per file
 *   .agent/memory/index.json generated retrieval index
 *   .agent/memory/digest.md  generated session digest
 *   .agent/handoff/          HANDOFF.md + handoff.json
 *   .agent/rules.md          canonical rules source
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export interface AgentPaths {
  root: string;
  kitConfig: string;
  bridgeDir: string;
  jobsDir: string;
  logsDir: string;
  resultsDir: string;
  adaptersFile: string;
  memoryDir: string;
  recordsDir: string;
  memoryIndex: string;
  memoryDigest: string;
  handoffDir: string;
  handoffMd: string;
  handoffJson: string;
  rulesFile: string;
}

export function agentPaths(cwd: string): AgentPaths {
  const root = join(cwd, ".agent");
  const bridgeDir = join(root, "bridge");
  const memoryDir = join(root, "memory");
  const handoffDir = join(root, "handoff");
  return {
    root,
    kitConfig: join(root, "kit.json"),
    bridgeDir,
    jobsDir: join(bridgeDir, "jobs"),
    logsDir: join(bridgeDir, "logs"),
    resultsDir: join(bridgeDir, "results"),
    adaptersFile: join(bridgeDir, "adapters.json"),
    memoryDir,
    recordsDir: join(memoryDir, "records"),
    memoryIndex: join(memoryDir, "index.json"),
    memoryDigest: join(memoryDir, "digest.md"),
    handoffDir,
    handoffMd: join(handoffDir, "HANDOFF.md"),
    handoffJson: join(handoffDir, "handoff.json"),
    rulesFile: join(root, "rules.md"),
  };
}

/** Create the full .agent/ tree (idempotent). */
export function ensureStateDirs(cwd: string): AgentPaths {
  const paths = agentPaths(cwd);
  for (const dir of [
    paths.root,
    paths.jobsDir,
    paths.logsDir,
    paths.resultsDir,
    paths.recordsDir,
    paths.handoffDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  return paths;
}

/** Atomic write: temp file + rename, so readers never see torn writes. */
export function writeFileAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, path);
}

export function readJsonFile<T = unknown>(path: string): T | null {
  const result = readJsonFileDetailed<T>(path);
  return result.ok ? result.value : null;
}

export type JsonReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "missing" | "invalid"; message: string };

export function readJsonFileDetailed<T = unknown>(path: string): JsonReadResult<T> {
  if (!existsSync(path)) {
    return { ok: false, reason: "missing", message: "file does not exist" };
  }
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf-8")) as T };
  } catch (e) {
    return { ok: false, reason: "invalid", message: (e as Error).message };
  }
}

export function writeJsonFile(path: string, value: unknown): void {
  writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

const LOCK_RETRY_MS = 25;
const LOCK_STALE_MS = 30_000;

/**
 * Cross-process mutex via lock directory (mkdir is atomic on every platform).
 * Stale locks (crashed holders) are broken after LOCK_STALE_MS based on the
 * lock's timestamp file.
 */
export async function withLock<T>(target: string, fn: () => Promise<T> | T): Promise<T> {
  const lockDir = `${target}.lock`;
  const stampFile = join(lockDir, "stamp");
  const deadline = Date.now() + LOCK_STALE_MS;
  for (;;) {
    try {
      mkdirSync(lockDir, { recursive: false });
      writeFileSync(stampFile, String(Date.now()));
      break;
    } catch {
      // Held by someone else — remove stale locks and re-race the atomic
      // mkdir (multiple takers can rm, but only one wins the next mkdir).
      try {
        const stamp = Number(readFileSync(stampFile, "utf-8"));
        if (Number.isFinite(stamp) && Date.now() - stamp > LOCK_STALE_MS) {
          const { rmSync } = await import("node:fs");
          rmSync(lockDir, { recursive: true, force: true });
          continue; // retry mkdir immediately — atomic winner takes the lock
        }
      } catch {
        // stamp unreadable — racing with creation; retry
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for lock: ${lockDir}`);
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
  try {
    return await fn();
  } finally {
    try {
      const { rmSync } = await import("node:fs");
      rmSync(stampFile, { force: true });
      rmdirSync(lockDir);
    } catch {
      // lock cleanup is best-effort
    }
  }
}

/** Read-modify-write a JSON file under the lock. */
export async function updateJsonFile<T>(
  path: string,
  update: (current: T | null) => T,
): Promise<T> {
  return withLock(path, () => {
    const current = readJsonFile<T>(path);
    const next = update(current);
    writeJsonFile(path, next);
    return next;
  });
}

export function stateInitialized(cwd: string): boolean {
  return existsSync(agentPaths(cwd).root);
}
