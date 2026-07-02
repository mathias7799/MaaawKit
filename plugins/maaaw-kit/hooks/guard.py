#!/usr/bin/env python3
"""PreToolUse guard: blocks destructive commands and protects sensitive files.

Covers Bash and the Windows-native PowerShell tool (both expose tool_input.command).

Wired to matcher "Bash|Edit|Write|MultiEdit" in settings.json.
Output contract (Claude Code hooks API):
  - JSON on stdout with hookSpecificOutput.permissionDecision: allow|deny|ask
  - exit 0 always (we communicate via JSON, not exit codes)
Deny reasons are shown to Claude so it can choose a safer alternative.
"""
import json
import re
import sys


def deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def ask(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


# (pattern, message, action) — action: "deny" or "ask"
BASH_RULES = [
    (r"\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(/|~|\$HOME)(\s|$)",
     "Refusing recursive delete of root/home. Target a specific path instead.", "deny"),
    (r"\bgit\s+push(?!.*--force-with-lease)(?=.*(\s--force\b|\s-f\b))",
     "Force push blocked. Use --force-with-lease, and only on feature branches.", "deny"),
    (r"\bgit\s+reset\s+--hard\b",
     "git reset --hard discards work. Confirm with user or use git stash.", "ask"),
    (r"\bgit\s+clean\s+-[a-zA-Z]*f",
     "git clean -f deletes untracked files permanently.", "ask"),
    (r"\bgit\s+checkout\s+\.\s*$|\bgit\s+restore\s+\.\s*$",
     "Discarding ALL uncommitted changes — confirm this is intended.", "ask"),
    (r"\bdd\s+.*\bof=/dev/",
     "Writing directly to a device is blocked.", "deny"),
    (r"\bmkfs\.|(?:^|[;&|]\s*)(format(\.com)?)\s+[a-zA-Z]:",
     "Filesystem format commands are blocked.", "deny"),
    (r"(?i)\bdrop\s+(database|table)\b",
     "DROP DATABASE/TABLE — needs explicit user confirmation.", "ask"),
    (r"(?i)\btruncate\s+table\b",
     "TRUNCATE TABLE — needs explicit user confirmation.", "ask"),
    (r"(?i)(?=.*\bRemove-Item\b)(?=.*-Recurse\b)(?=.*-Force\b)(?=.*(\s[a-zA-Z]:\\?(\s|$|['\"])|\$env:USERPROFILE|\$HOME\b|\s~[/\\]?(\s|$)))",
     "Refusing recursive force-delete of a drive root or user profile.", "deny"),
    (r"\bgit\s+push\s+.*--mirror\b",
     "git push --mirror overwrites the remote wholesale. Blocked.", "deny"),
    (r"\bgit\s+branch\s+(-D|--delete\s+--force)\b",
     "Force-deleting a branch discards unmerged work.", "ask"),
    (r"\bgit\s+tag\s+(-d|--delete)\b",
     "Deleting tags — confirm intent.", "ask"),
    (r"\bdocker\s+system\s+prune\b|\bdocker\s+(image|container|volume)\s+prune\b",
     "Docker prune removes data broadly.", "ask"),
    (r"\bkubectl\s+delete\b",
     "kubectl delete against a live cluster — confirm target and context.", "ask"),
    (r"\baz\s+(group|resource)\s+delete\b|\baz\s+deployment\s+group\s+delete\b|\baz\s+keyvault\s+secret\s+delete\b|\baz\s+storage\s+container\s+delete\b|\bgcloud\s+projects\s+delete\b|\baws\s+s3\s+rb\b",
     "Cloud resource/resource-group/bucket deletion — needs explicit approval.", "ask"),
    (r"\bterraform\s+destroy\b|\bpulumi\s+destroy\b",
     "Infrastructure destroy — needs explicit approval.", "ask"),
    (r"curl\s+[^|]*\|\s*(ba)?sh|irm\s+[^|]*\|\s*iex|iwr\s+[^|]*\|\s*iex",
     "Piping remote scripts to a shell — needs explicit user approval.", "ask"),
    (r"\bgh\s+repo\s+delete\b|\bgh\s+release\s+delete\b|\bgh\s+api\b(?=.*\s-X\s+DELETE\b)",
     "GitHub destructive operation — needs explicit approval.", "ask"),
    (r"(?i)\bnpm\s+publish\b|\bdotnet\s+nuget\s+push\b|\btwine\s+upload\b",
     "Publishing packages needs explicit user approval.", "ask"),
]

# Files Claude should not write to without asking
PROTECTED_WRITE = [
    (r"(^|[/\\])\.env(\.[\w.]+)?$", "Writing to .env (secrets). Confirm with the user."),
    (r"(^|[/\\])(id_rsa|id_ed25519|.*\.pem|.*\.pfx|.*\.key)$", "Writing to a private key file."),
    (r"(^|[/\\])appsettings\.Production\.json$", "Editing PRODUCTION appsettings. Confirm first."),
    (r"(^|[/\\])\.git[/\\]", "Direct writes inside .git/ are blocked."),
]


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # never break the session on hook bugs

    tool = data.get("tool_name", "")
    tool_input = data.get("tool_input", {}) or {}

    if tool in ("Bash", "PowerShell"):
        cmd = tool_input.get("command", "") or ""
        # Text-bearing commands (commit messages, echoes) trigger SQL keyword
        # rules spuriously; skip the (?i) SQL rules for those.
        textish = re.match(r"\s*(git\s+(commit|tag)|echo|printf)\b", cmd)
        for pattern, msg, action in BASH_RULES:
            if textish and ("drop" in pattern.lower() or "truncate" in pattern.lower()):
                continue
            if re.search(pattern, cmd):
                (deny if action == "deny" else ask)(msg)

    elif tool in ("Edit", "Write", "MultiEdit"):
        path = tool_input.get("file_path", "") or ""
        for pattern, msg in PROTECTED_WRITE:
            if re.search(pattern, path):
                ask(msg)

    sys.exit(0)  # allow (defer to normal permission flow)


if __name__ == "__main__":
    main()
