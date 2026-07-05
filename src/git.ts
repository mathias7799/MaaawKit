import { execa } from "execa";

export async function gitChangedFiles(cwd: string): Promise<string[]> {
  try {
    const result = await execa("git", ["diff", "--name-only", "HEAD"], {
      cwd,
      timeout: 10_000,
      reject: false,
    });
    if (result.exitCode !== 0) return [];
    return result.stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
