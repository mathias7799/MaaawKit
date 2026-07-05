import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

export function isGitTracked(path: string, cwd: string): boolean {
  try {
    const rel = relative(cwd, path);
    const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", rel], {
      cwd,
      timeout: 10_000,
      stdio: "ignore",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function isPathInside(path: string, parent: string): boolean {
  const resolvedPath = resolve(path);
  const resolvedParent = resolve(parent);
  const rel = relative(resolvedParent, resolvedPath);
  return rel === "" || (!!rel && !rel.startsWith("..") && !rel.startsWith("/") && rel !== "..");
}
