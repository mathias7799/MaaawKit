# MaaawKit Codex Support

MaaawKit supports Codex in two different ways:

1. **Handoff/export**: prepare the repo for a human or Codex session with `AGENTS.md`, `.codex/brief.md`, optional skills/config/hooks.
2. **Worker delegation**: let Claude Code launch a bounded Codex worker during the current session, capture the result, and review any patch before applying it.

Codex is not a drop-in runtime for Claude Code plugin features. MaaawKit translates the useful pieces into Codex-native files and a safe CLI workflow.

## Codex-native files

Recommended exported layout:

```text
AGENTS.md
.codex/brief.md
.codex/config.toml
.codex/hooks.json
.codex/hooks/*.py
.codex/tasks/*.md
.codex/results/*.md
.agents/skills/*/SKILL.md
```

Use:

```bash
python plugins/maaaw-kit/scripts/to-codex.py \
  --goal "Continue implementation" \
  --oracle "npm test" \
  --install-skills \
  --write-config
```

Optional hooks:

```bash
python plugins/maaaw-kit/scripts/to-codex.py \
  --goal "Continue implementation" \
  --install-hooks
```

After installing hooks, open Codex and run `/hooks` to review/trust them.

## AGENTS.md

`AGENTS.md` is the durable Codex instruction file. Keep it lean:

- project overview
- build/test commands
- coding conventions
- verification expectations
- safety rules
- durable project lessons

Do not put temporary task state in `AGENTS.md`. Use `.codex/brief.md` instead.

MaaawKit writes only marker-delimited sections:

```markdown
<!-- maaaw-kit:start -->
...
<!-- maaaw-kit:end -->

<!-- maaaw-kit-lessons:start -->
...
<!-- maaaw-kit-lessons:end -->
```

Existing human content is preserved and backed up to `AGENTS.md.bak`.

## Skills

Codex skills are exported to:

```text
.agents/skills/
```

MaaawKit exports reusable, Codex-safe skills such as:

```text
codebase-audit
quick-audit
codex-handoff
codex-worker
coding-standards
debugging
deep-thinking
memory-and-learning
verification-loop
grill-me
vibe-to-prd
codebase-documenter
```

Each skill is a folder with `SKILL.md` and optional supporting files.

## Hooks

MaaawKit can export optional Codex hooks:

```text
.codex/hooks.json
.codex/hooks/guard.py
.codex/hooks/post-edit-check.py
.codex/hooks/stop-verify.py
.codex/hooks/session-context.py
```

The hook config uses the event-keyed Codex shape:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "python", "args": [".codex/hooks/session-context.py"] }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash|PowerShell|Edit|Write|MultiEdit", "hooks": [{ "type": "command", "command": "python", "args": [".codex/hooks/guard.py"] }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write|MultiEdit", "hooks": [{ "type": "command", "command": "python", "args": [".codex/hooks/post-edit-check.py"] }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "python", "args": [".codex/hooks/stop-verify.py"] }] }
    ]
  }
}
```

Codex non-managed hooks require review/trust. Do not trust hooks from repositories you do not control.

## Worker delegation

Use `codex-worker.py` when Claude should delegate a bounded task to Codex during the current session.

Review-only:

```bash
python plugins/maaaw-kit/scripts/codex-worker.py \
  --task "Review backend authz for privilege escalation bugs" \
  --mode review-only \
  --run
```

Implementation in isolated worktree:

```bash
python plugins/maaaw-kit/scripts/codex-worker.py \
  --task "Fix webhook retry idempotency" \
  --mode backend-task \
  --oracle "npm test" \
  --run
```

Without `--run`, the script prepares `.codex/tasks/*` and `.codex/results/*` and prints the launch command.

### Worker modes

| Mode | Writes? | Target |
|---|---:|---|
| `review-only` | No | current repo, read-only sandbox |
| `security-pass` | No | current repo, read-only sandbox |
| `implementation-worktree` | Yes | isolated worktree |
| `backend-task` | Yes | isolated worktree |
| `test-fix` | Yes | isolated worktree |

### Worker result contract

Codex must return Markdown with:

```text
# Codex Worker Result
## Status
## Summary
## Assumptions
## Changed files
## Verification run
## Findings or implementation notes
## Needs Claude review
```

Write-capable modes mirror patches back to the orchestrator repo:

```text
.codex/results/<timestamp>-<slug>.patch
.codex/results/<timestamp>-<slug>.stat.txt
```

Claude must inspect and verify before accepting any Codex change.

## Recommended safety rules

- Do not run Claude and Codex with write access in the same working tree.
- Use worktrees for write-capable Codex tasks.
- Use read-only mode for review-only tasks.
- Do not let Codex commit, push, publish, or open PRs in this flow.
- Do not expose API keys to untrusted repo-controlled scripts.
- Treat `.codex/hooks.json`, `.codex/loop.json`, and `.claude/loop.json` as executable automation inputs.
- Keep worker tasks bounded and testable.

## Claude ↔ Codex mapping

| Claude/MaaawKit concept | Codex equivalent |
|---|---|
| `CLAUDE.md` | `AGENTS.md` durable guidance |
| `HANDOFF.md` | `.codex/brief.md` task state |
| Claude skills | `.agents/skills/*/SKILL.md` |
| Claude hooks | `.codex/hooks.json` + `.codex/hooks/*.py` |
| `/loop` | `Stop` hook with trusted oracle config |
| `/to-codex` | Codex export |
| `/codex-worker` | bounded `codex exec` delegation |

## Maintenance checklist

Before release:

```bash
python tools/validate.py
python plugins/maaaw-kit/hooks/selftest.py
```

Also smoke-test:

```bash
python plugins/maaaw-kit/scripts/codex-worker.py \
  --task "Smoke test prepared worker" \
  --mode review-only
```
