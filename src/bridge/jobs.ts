/**
 * Job store — schema-validated JobRecords, one JSON file per job under
 * .agent/bridge/jobs/. All writes go through the state manager's atomic I/O.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type JobRecord, JobRecordSchema } from "../schemas/index.js";
import { agentPaths, readJsonFile, updateJsonFile, writeJsonFile } from "../state/index.js";
import { isGitTracked } from "../trust.js";

export function newJobId(): string {
  return `job_${randomBytes(4).toString("hex")}`;
}

export function jobPath(cwd: string, id: string): string {
  return join(agentPaths(cwd).jobsDir, `${id}.json`);
}

export function saveJob(cwd: string, job: JobRecord): void {
  writeJsonFile(jobPath(cwd, job.id), JobRecordSchema.parse(job));
}

export function loadJob(cwd: string, id: string): JobRecord | null {
  const path = jobPath(cwd, id);
  if (isGitTracked(path, cwd)) return null;
  const raw = readJsonFile(path);
  if (!raw) return null;
  const parsed = JobRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function updateJob(
  cwd: string,
  id: string,
  patch: Partial<JobRecord>,
): Promise<JobRecord> {
  return updateJsonFile<JobRecord>(jobPath(cwd, id), (current) => {
    if (!current) throw new Error(`Job not found: ${id}`);
    return JobRecordSchema.parse({ ...current, ...patch });
  });
}

export function listJobs(cwd: string): JobRecord[] {
  const dir = agentPaths(cwd).jobsDir;
  if (!existsSync(dir)) return [];
  const jobs: JobRecord[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const path = join(dir, f);
    if (isGitTracked(path, cwd)) continue;
    const parsed = JobRecordSchema.safeParse(readJsonFile(path));
    if (parsed.success) jobs.push(parsed.data);
  }
  return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
