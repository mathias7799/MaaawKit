/**
 * Post-edit check: pure parts of the PostToolUse hook — path extraction from
 * tool input and language/tool dispatch. Actually running formatters/linters
 * is wired in the hook runtime (Phase 2), which injects a command runner so
 * this stays testable without the tools installed.
 */

export const POST_EDIT_TIMEOUT_MS = 90_000;
export const MAX_FEEDBACK_CHARS = 4000;

export type Language = "python" | "typescript" | "csharp" | "powershell";

const EXTENSION_DISPATCH: Record<string, Language> = {
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "typescript",
  ".jsx": "typescript",
  ".mjs": "typescript",
  ".cjs": "typescript",
  ".cs": "csharp",
  ".ps1": "powershell",
  ".psm1": "powershell",
  ".psd1": "powershell",
};

export function languageFor(filePath: string): Language | null {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = filePath.slice(dot).toLowerCase();
  return EXTENSION_DISPATCH[ext] ?? null;
}

/**
 * Extract every file path from a tool input, covering Edit/Write/MultiEdit and
 * defensive fallbacks (2.6 behavior: file_path/path plus nested edits/files/changes).
 * Returns unique, sorted paths.
 */
export function extractPaths(toolInput: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  for (const key of ["file_path", "path"]) {
    const value = toolInput[key];
    if (typeof value === "string" && value) paths.add(value);
  }
  for (const key of ["edits", "files", "changes"]) {
    let items = toolInput[key];
    if (items && typeof items === "object" && !Array.isArray(items)) items = [items];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      for (const pkey of ["file_path", "path"]) {
        const value = (item as Record<string, unknown>)[pkey];
        if (typeof value === "string" && value) paths.add(value);
      }
    }
  }
  return [...paths].sort();
}

/** Format diagnostics into the PostToolUse block message (2.6 contract). */
export function formatBlockMessage(fileName: string, problems: string[]): string {
  const reason = problems.join("\n").slice(0, MAX_FEEDBACK_CHARS);
  return (
    `Automated checks found issues in ${fileName} (auto-formatting was already applied):\n` +
    `${reason}\n\nFix these now. Do NOT disable rules to silence them.`
  );
}

/** Serialize to the PostToolUse hook JSON contract; undefined = clean, stay silent. */
export function toPostEditHookOutput(fileName: string, problems: string[]): string | undefined {
  if (problems.length === 0) return undefined;
  return JSON.stringify({ decision: "block", reason: formatBlockMessage(fileName, problems) });
}
