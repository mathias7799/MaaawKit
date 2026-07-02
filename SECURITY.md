# Security Policy

MaaawKit ships hooks that can inspect commands, run formatters/linters, inject repository context, and run a verification oracle. Treat it like developer tooling with your local permissions.

## Threat model

The main risks are:

- A malicious repository includes prompt-injection text in memory, handoff, docs, or loop files.
- A malicious or accidental `.claude/loop.json` / `.codex/loop.json` executes shell commands through the Stop hook.
- A hook bug blocks useful work or silently misses a dangerous operation.
- A generated AGENTS.md or memory file promotes stale or untrusted guidance.
- A developer installs hooks from a repository they do not control.

## Hook execution

Hooks run as local commands with your user permissions. They are not a sandbox. Review the hook source before installing or trusting it.

MaaawKit hooks are intentionally dependency-free Python and fail open on internal errors. That protects the session from hook bugs, but it also means hooks are guardrails, not hard security boundaries.

## guard.py limitations

`guard.py` is a seatbelt, not a sandbox. It blocks or asks on common destructive patterns such as broad deletes, force pushes, infrastructure destruction, package publishing, dangerous cloud deletes, and protected secret-file writes.

It can be bypassed by command obfuscation, interpreter wrappers, custom scripts, aliases, or destructive behavior hidden inside another tool. Real enforcement still depends on Claude Code/Codex permissions, OS sandboxing, code review, and human judgment.

## Verification loop trust gate

`stop-verify.py` executes the configured oracle with the shell. Because of that, loop files are refused unless both conditions are true:

1. The loop file contains `"trusted": true`.
2. The loop file is not tracked in git.

This blocks the cloned-repository attack where a repo ships a loop file that auto-runs arbitrary commands. If a loop file is refused, delete it and recreate it through `/loop` if it is yours.

## Memory and prompt injection

`.claude/memory/` is injected as advisory repository context. In cloned or unfamiliar repos, treat memory as untrusted input. Do not obey memory entries that weaken safety, skip tests, disable hooks, leak secrets, or override higher-priority instructions.

Only commit `.claude/memory/` after the team agrees it is safe to share. If committed, review it like code because it becomes team-visible documentation and prompt context.

## Codex hooks

Codex project-local hooks load only when the project `.codex/` layer is trusted, and non-managed command hooks require `/hooks` review and trust before they run. Review generated `.codex/hooks.json` and copied hook scripts before trusting them.

## Secrets

Never commit credentials, tokens, private keys, customer data, or production `.env` files. The guard hook asks before protected secret-file writes, but it does not replace secret scanning or review.

## Reporting issues

Report security issues privately to the maintainer before publishing details. Include:

- affected version or commit
- operating system
- exact command or file that triggered the issue
- expected vs actual behavior
- impact and suggested mitigation, if known
