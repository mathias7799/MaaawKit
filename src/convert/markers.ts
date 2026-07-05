/**
 * Marker-delimited managed sections — the proven to-codex.py discipline,
 * generalized. All generated writes into human-owned files go between markers;
 * replacement is idempotent and everything outside the markers is preserved.
 */

export const GEN_BEGIN = "<!-- maaaw-kit:start -->";
export const GEN_END = "<!-- maaaw-kit:end -->";
export const LES_BEGIN = "<!-- maaaw-kit-lessons:start -->";
export const LES_END = "<!-- maaaw-kit-lessons:end -->";
export const BRIEF_BEGIN = "<!-- maaaw-kit-brief:start -->";
export const BRIEF_END = "<!-- maaaw-kit-brief:end -->";
export const MEMORY_BEGIN = "<!-- maaaw-kit-memory:start -->";
export const MEMORY_END = "<!-- maaaw-kit-memory:end -->";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ReplaceResult {
  text: string;
  replaced: boolean;
}

/**
 * Replace the region between `begin` and `end` (inclusive of the markers) with
 * `block`. `block` must itself contain the markers (callers build blocks via
 * `managedBlock`). If the markers are absent, returns the input unchanged with
 * replaced=false. Non-greedy: only the first begin..end region is replaced.
 */
export function replaceBetween(
  text: string,
  begin: string,
  end: string,
  block: string,
): ReplaceResult {
  const pattern = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (!pattern.test(text)) return { text, replaced: false };
  // Function replacement avoids `$`-sequence interpretation in block content.
  return { text: text.replace(pattern, () => block), replaced: true };
}

/** Wrap body in begin/end markers. */
export function managedBlock(begin: string, end: string, body: string): string {
  return `${begin}\n${body.replace(/\s+$/, "")}\n${end}`;
}

/**
 * Insert-or-replace: replace the marked region when present, otherwise append
 * the block (with an optional heading) at the end of the document.
 */
export function upsertBlock(
  text: string,
  begin: string,
  end: string,
  block: string,
  appendHeading?: string,
): ReplaceResult {
  const attempt = replaceBetween(text, begin, end, block);
  if (attempt.replaced) return attempt;
  const heading = appendHeading ? `\n\n${appendHeading}\n` : "\n\n";
  return { text: `${text.replace(/\s+$/, "")}${heading}${block}\n`, replaced: false };
}

/** Extract the body between markers (excluding the marker lines), or null. */
export function extractBetween(text: string, begin: string, end: string): string | null {
  const pattern = new RegExp(`${escapeRegExp(begin)}\\n?([\\s\\S]*?)\\n?${escapeRegExp(end)}`);
  const m = pattern.exec(text);
  return m ? (m[1] ?? "") : null;
}
