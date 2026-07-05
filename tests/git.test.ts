import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitChangedFiles } from "../src/git.js";

let dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-git-"));
  dirs.push(d);
  return d;
}

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("git helpers", () => {
  it("returns changed files relative to HEAD", async () => {
    const cwd = tmp();
    git(cwd, "init", "-q");
    git(cwd, "config", "user.email", "t@example.com");
    git(cwd, "config", "user.name", "t");
    writeFileSync(join(cwd, "tracked.txt"), "original\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "init");

    writeFileSync(join(cwd, "tracked.txt"), "changed\n");

    await expect(gitChangedFiles(cwd)).resolves.toEqual(["tracked.txt"]);
  });

  it("falls back to empty list outside a git repo", async () => {
    await expect(gitChangedFiles(tmp())).resolves.toEqual([]);
  });
});
