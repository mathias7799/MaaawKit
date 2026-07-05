/**
 * Canonical guard rule table: single source of truth for destructive-command
 * and protected-file policy. The hook engine evaluates this directly; the
 * zero-dependency shim fallback is generated from the same table.
 */

export type GuardAction = "deny" | "ask";

export interface BashRule {
  /** JS regex source (no delimiters). */
  pattern: string;
  /** Regex flags, e.g. "i". */
  flags: string;
  message: string;
  action: GuardAction;
  /** "sql" rules are skipped for text-bearing commands such as commit messages. */
  category?: "sql";
}

export interface WriteRule {
  pattern: string;
  flags: string;
  message: string;
}

export const BASH_RULES: readonly BashRule[] = [
  {
    // Flags: short (-rf, -r -f) or long (--recursive/--force). Targets (each at
    // an argument boundary, optionally quoted): root and root glob, home, $HOME/
    // ${HOME}, and top-level system dirs (bare, trailing slash, or glob only —
    // deep subpaths like /var/log/app stay allowed to avoid false positives).
    pattern: String.raw`\brm\s+(?=[^;&|]*(?:-[a-zA-Z]*[rf][a-zA-Z]*|--recursive|--force|--no-preserve-root)\b)[^;&|]*?\s['"]?(?:/(?:\*+)?|~[/\\]?|(?:\$HOME|\$\{HOME\})[/\\]?|/(?:etc|usr|var|bin|sbin|lib|lib64|boot|sys|proc|dev|root|home|opt)(?:/\*?|/)?)['"]?(?=\s|$)`,
    flags: "",
    message:
      "Refusing recursive delete of root/home/system paths. Target a specific safe path instead.",
    action: "deny",
  },
  {
    pattern: String.raw`\bgit\s+push(?!.*--force-with-lease)(?=.*(\s--force\b|\s-f\b))`,
    flags: "",
    message: "Force push blocked. Use --force-with-lease, and only on feature branches.",
    action: "deny",
  },
  {
    pattern: String.raw`\bgit\s+push\b(?=.*\s\+\S+)`,
    flags: "",
    message: "Force-push refspecs with leading + are blocked. Use --force-with-lease explicitly.",
    action: "deny",
  },
  {
    pattern: String.raw`\bgit\s+reset\s+--hard\b`,
    flags: "",
    message: "git reset --hard discards work. Confirm with user or use git stash.",
    action: "ask",
  },
  {
    pattern: String.raw`\bgit\s+clean\s+-[a-zA-Z]*f`,
    flags: "",
    message: "git clean -f deletes untracked files permanently.",
    action: "ask",
  },
  {
    pattern: String.raw`\bgit\s+checkout\s+\.\s*$|\bgit\s+restore\s+\.\s*$`,
    flags: "",
    message: "Discarding ALL uncommitted changes — confirm intended.",
    action: "ask",
  },
  {
    pattern: String.raw`\bdd\s+.*\bof=/dev/`,
    flags: "",
    message: "Writing directly to device is blocked.",
    action: "deny",
  },
  {
    pattern: String.raw`\bmkfs\.|(?:^|[;&|]\s*)(format(\.com)?)\s+[a-zA-Z]:`,
    flags: "",
    message: "Filesystem format commands are blocked.",
    action: "deny",
  },
  {
    pattern: String.raw`\bdrop\s+(database|table)\b`,
    flags: "i",
    message: "DROP DATABASE/TABLE — needs explicit user confirmation.",
    action: "ask",
    category: "sql",
  },
  {
    pattern: String.raw`\btruncate\s+table\b`,
    flags: "i",
    message: "TRUNCATE TABLE — needs explicit user confirmation.",
    action: "ask",
    category: "sql",
  },
  {
    pattern: String.raw`(?=.*\bRemove-Item\b)(?=.*-Recurse\b)(?=.*-Force\b)(?=.*(\s[a-zA-Z]:\\?(\s|$|['"])|\$env:USERPROFILE|\$HOME\b|\s~[/\\]?(\s|$)))`,
    flags: "i",
    message: "Refusing recursive force-delete of drive root or user profile.",
    action: "deny",
  },
  {
    pattern: String.raw`\bgit\s+push\s+.*--mirror\b`,
    flags: "",
    message: "git push --mirror overwrites remote wholesale. Blocked.",
    action: "deny",
  },
  {
    pattern: String.raw`\bgit\s+branch\s+(-D|--delete\s+--force)\b`,
    flags: "",
    message: "Force-deleting branch discards unmerged work.",
    action: "ask",
  },
  {
    pattern: String.raw`\bgit\s+tag\s+(-d|--delete)\b`,
    flags: "",
    message: "Deleting tags — confirm intent.",
    action: "ask",
  },
  {
    pattern: String.raw`\bdocker\s+system\s+prune\b|\bdocker\s+(image|container|volume)\s+prune\b`,
    flags: "",
    message: "Docker prune removes data broadly.",
    action: "ask",
  },
  {
    pattern: String.raw`\bkubectl\s+delete\b`,
    flags: "",
    message: "kubectl delete against live cluster — confirm target context.",
    action: "ask",
  },
  {
    pattern: String.raw`\baz\s+(group|resource)\s+delete\b|\baz\s+deployment\s+group\s+delete\b|\baz\s+keyvault\s+secret\s+delete\b|\baz\s+storage\s+container\s+delete\b|\bgcloud\s+projects\s+delete\b|\baws\s+s3\s+rb\b`,
    flags: "",
    message: "Cloud resource/resource-group/bucket deletion — needs explicit approval.",
    action: "ask",
  },
  {
    pattern: String.raw`\bterraform\s+destroy\b|\bpulumi\s+destroy\b`,
    flags: "",
    message: "Infrastructure destroy — needs explicit approval.",
    action: "ask",
  },
  {
    pattern: String.raw`(?:curl|wget)\s+[^|]*\|\s*(?:sudo\s+)?(?:(?:ba|z|k|da)?sh|fish)\b|irm\s+[^|]*\|\s*iex|iwr\s+[^|]*\|\s*iex`,
    flags: "",
    message: "Piping remote scripts to shell — needs explicit user approval.",
    action: "ask",
  },
  {
    pattern: String.raw`(?:>|>>)\s*(?:\.env(?:\.[\w.]+)?|[^\s;&|]+[/\\]\.env(?:\.[\w.]+)?)(?=\s|$|[;&|])`,
    flags: "",
    message: "Shell redirection to .env (secrets) needs explicit user approval.",
    action: "ask",
  },
  {
    pattern: String.raw`(?:>|>>)\s*(?:id_rsa|id_ed25519|[^\s;&|]+\.(?:pem|pfx|key))(?=\s|$|[;&|])`,
    flags: "",
    message: "Shell redirection to private key material needs explicit user approval.",
    action: "ask",
  },
  {
    pattern: String.raw`\btee\s+(?:-a\s+)?(?:\.env(?:\.[\w.]+)?|[^\s;&|]+[/\\]\.env(?:\.[\w.]+)?|id_rsa|id_ed25519|[^\s;&|]+\.(?:pem|pfx|key))(?=\s|$|[;&|])`,
    flags: "",
    message: "Writing secrets/keys via tee — needs explicit user approval.",
    action: "ask",
  },
  {
    pattern: String.raw`\bgh\s+repo\s+delete\b|\bgh\s+release\s+delete\b|\bgh\s+api\b(?=.*\s-X\s+DELETE\b)`,
    flags: "",
    message: "GitHub destructive operation — needs explicit approval.",
    action: "ask",
  },
  {
    pattern: String.raw`\bnpm\s+publish\b|\bdotnet\s+nuget\s+push\b|\btwine\s+upload\b`,
    flags: "i",
    message: "Publishing packages needs explicit user approval.",
    action: "ask",
  },
];

export const PROTECTED_WRITE_RULES: readonly WriteRule[] = [
  {
    pattern: String.raw`(^|[/\\])\.env(\.[\w.]+)?$`,
    flags: "",
    message: "Writing to .env (secrets). Confirm with user.",
  },
  {
    pattern: String.raw`(^|[/\\])(id_rsa|id_ed25519|.*\.pem|.*\.pfx|.*\.key)$`,
    flags: "",
    message: "Writing to a private key file.",
  },
  {
    pattern: String.raw`(^|[/\\])appsettings\.Production\.json$`,
    flags: "",
    message: "Editing PRODUCTION appsettings. Confirm first.",
  },
  {
    pattern: String.raw`(^|[/\\])\.git[/\\]`,
    flags: "",
    message: "Direct writes inside .git/ are blocked.",
  },
];

/** Commands whose free text (commit messages, echoes) spuriously trips SQL rules. */
export const TEXTISH_COMMAND = String.raw`^\s*(git\s+(commit|tag)|echo|printf)\b`;
