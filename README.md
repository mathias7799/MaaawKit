# MaaawKit

[![ci](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml) · MIT · Windows / macOS / Linux · Python stdlib hooks

**MaaawKit** is a production engineering kit for **Claude Code** and **OpenAI Codex**. It packages reusable skills, safety hooks, verification loops, specialist audit agents, project memory, Codex handoff, and a safe Claude→Codex worker pattern.

It is tuned for teams that want coding agents to behave more like senior engineers: plan first, change narrowly, verify honestly, remember project lessons, and avoid dangerous operations.

```text
15 skills · 4 hooks · 8 specialist agents · 16 slash commands
```

## Why MaaawKit exists

AI coding sessions usually fail for the same reasons:

- the agent starts implementing before understanding the repo,
- rules live in prose and get ignored under pressure,
- tests are skipped or weakened,
- long sessions lose context,
- handoffs between Claude, Codex, and humans are lossy,
- safety depends on the model “remembering” not to do dangerous things.

MaaawKit splits responsibility clearly:

```text
Skills   = judgment and reusable workflows
Hooks    = mechanical guardrails
Agents   = focused specialist reviewers
Commands = repeatable entry points
Memory   = project lessons and durable context
Codex    = optional second worker, isolated by worktree when it writes
```

## Install

Inside Claude Code:

```text
/plugin marketplace add maaaw/maaaw-kit
/plugin install maaaw-kit@maaaw-kit-marketplace
```

Restart when prompted.

Verify locally:

```bash
python plugins/maaaw-kit/hooks/selftest.py
python tools/validate.py
```

Requirements:

- Python 3.10+ on PATH as `python`
- optional project tools are used only when present: `ruff`, `eslint`, `prettier`, `dotnet format`, `PSScriptAnalyzer`
- Codex features require the Codex CLI when you actually run Codex worker tasks

If your machine uses `python3` or `py -3`, change the hook command in `plugins/maaaw-kit/hooks/hooks.json`.

<details>
<summary>Manual install</summary>

Copy these folders into a repo-level `.claude/` directory or global `~/.claude/` directory:

```text
plugins/maaaw-kit/skills
plugins/maaaw-kit/agents
plugins/maaaw-kit/commands
plugins/maaaw-kit/hooks
```

Then merge `manual-install/settings.json` into your Claude Code settings and adjust hook paths.
</details>

## Quickstart

In a repository:

```text
/kit-setup
```

That command recons the repo, prepares Claude project context, creates memory folders, detects verification commands, and suggests a baseline audit.

Common commands:

```text
/plan "Add idempotent webhook retries"
/review
/audit
/audit-swarm
/loop "green backend tests" --oracle "npm test" --max 10
/to-codex "Prepare this repo for Codex" --install-skills --write-config
/codex-worker "Audit backend retry flow" --mode review-only --run
/codex-worker "Fix failing webhook test" --mode backend-task --oracle "npm test" --run
```

## What is included

### Skills

Skills are reusable workflows that load on demand.

| Skill | Purpose |
|---|---|
| `coding-standards` | Language-specific production rules for .NET, PowerShell, TypeScript/React/Next.js, and Python |
| `deep-thinking` | Risk-first planning and option selection before implementation |
| `debugging` | Reproduce, isolate, instrument, prove, and fix one hypothesis at a time |
| `orchestration` | Delegate safely across subagents or task partitions |
| `workflow-orchestration` | Fleet-scale audit/workflow design where Claude Code Workflows are available, with fallback to subagents |
| `verification-loop` | Oracle-driven “keep fixing until green or budget exhausted” loop |
| `codebase-audit` | Deep evidence-based codebase audit |
| `quick-audit` | Honest fast audit with explicit “not checked” list |
| `grill-me` | Adversarial review and pre-mortem |
| `vibe-to-prd` | Vague idea to agent-buildable PRD |
| `codebase-documenter` | README/architecture/project docs from actual code and verified commands |
| `session-handoff` | Precise handoff protocol for long tasks |
| `codex-handoff` | Export AGENTS.md, Codex brief, skills, config, and optional hooks |
| `codex-worker` | Delegate bounded review or implementation tasks from Claude to Codex |
| `memory-and-learning` | Capture durable lessons, rules, preferences, and mistakes |

### Hooks

Hooks are pure-stdlib Python and fail open if the hook itself errors.

| Hook | Event | Purpose |
|---|---|---|
| `guard.py` | `PreToolUse` | Blocks or asks before destructive shell/Git/cloud/secret operations |
| `post-edit-check.py` | `PostToolUse` | Runs relevant format/lint checks after file edits when tools/configs exist |
| `stop-verify.py` | `Stop` | Enforces `.claude/loop.json` / `.codex/loop.json` verification oracles |
| `session-context.py` | `SessionStart` | Injects branch, dirty state, recent commits, active loop, handoff, and memory context |

Examples of guarded operations:

```text
rm -rf /                  denied
git push --force main     denied
git reset --hard          ask
git clean -fdx            ask
terraform destroy         ask
kubectl delete            ask
az group delete           ask
curl ... | sh             ask
writing .env/private keys ask
```

Hooks are guardrails, not a sandbox. Review `SECURITY.md` before installing hooks globally.

### Agents

MaaawKit includes 8 specialist agents:

| Agent | Role |
|---|---|
| `repo-scout` | Fast repo orientation with observation vs inference separated |
| `code-reviewer` | Read-only code review with file:line evidence |
| `bug-hunter` | Diagnosis and root-cause isolation |
| `test-writer` | Behavior-driven tests in the repo’s framework |
| `security-auditor` | Secrets, injection, authz, boundaries, vulnerable deps |
| `architecture-auditor` | Dependency direction, hotspots, consistency, error strategy |
| `scalability-auditor` | N+1, unbounded work, timeouts, horizontal scaling blockers |
| `quality-auditor` | Build/test/lint evidence and test trustworthiness |

### Commands

```text
/kit-help       Orientation
/kit-setup      Bootstrap a repo
/plan           Produce a risk-first implementation plan
/loop           Start oracle-enforced verification loop
/review         Review current diff
/audit          Deep audit
/audit-swarm    Parallel specialist audit
/quick-audit    Fast audit with not-checked list
/grill          Adversarial review
/prd            Turn idea into PRD
/document       Generate docs from real code
/handoff        Write session handoff
/to-codex       Export Codex-native repo setup
/codex-worker   Delegate a bounded task to Codex CLI
/learn          Capture durable lesson
/memory         Inspect/curate memory
```

## Claude → Codex worker delegation

MaaawKit can let Claude hand a bounded task to Codex **during the same Claude Code session**.

The safe model is:

```text
Claude Code session
  ↓
/codex-worker command
  ↓
.codex/tasks/<task>.md
  ↓
codex exec
  ↓
.codex/results/<result>.md
  ↓
Claude reviews result + patch before accepting anything
```

For answer-only work:

```text
/codex-worker "Review the backend auth flow for authz bugs" --mode review-only --run
```

For write-capable work:

```text
/codex-worker "Fix the webhook retry idempotency bug" --mode backend-task --oracle "npm test" --run
```

Write-capable modes create a separate Git worktree:

```text
../<repo>-codex-<task-slug>/
branch: codex/<task-slug>
```

Claude then reads:

```text
.codex/results/<timestamp>-<slug>.md
.codex/results/<timestamp>-<slug>.patch
.codex/results/<timestamp>-<slug>.stat.txt
```

Claude should inspect and verify before applying or merging. Codex should not commit, push, publish, or open pull requests from this flow.

Supported modes:

| Mode | Writes? | Use for |
|---|---:|---|
| `review-only` | No | architecture/security/code review, findings, suggested patches |
| `security-pass` | No | focused security review |
| `implementation-worktree` | Yes, isolated | generic implementation attempt |
| `backend-task` | Yes, isolated | bounded backend changes |
| `test-fix` | Yes, isolated | reproduce/fix failing tests |

Without `--run`, `/codex-worker` only prepares files and prints the exact launch command.

## Codex handoff/export

`/to-codex` prepares a Codex-native setup:

```text
AGENTS.md
.codex/brief.md
.codex/config.toml               optional
.codex/hooks.json                optional
.codex/hooks/*                   optional
.agents/skills/*                 optional
```

Use:

```text
/to-codex "Continue this implementation in Codex" --install-skills --write-config
```

Optional hooks:

```text
/to-codex "Continue this implementation in Codex" --install-hooks
```

Codex hooks must be reviewed and trusted in Codex with `/hooks` before relying on them.

## Verification loop

Start a loop:

```text
/loop "green after refactor" --oracle "dotnet build -warnaserror && dotnet test" --max 15
```

MaaawKit writes `.claude/loop.json` with a required trust flag. On every attempt to stop, `stop-verify.py` re-runs the oracle:

- green: loop dissolves with evidence,
- failing: Claude receives the failure output and keeps working,
- budget exhausted: honest not-done report,
- cancel: delete `.claude/loop.json`.

The hook refuses untrusted or git-tracked loop files.

## Memory and learning

MaaawKit keeps three levels of project knowledge:

```text
CLAUDE.md              durable project law
.claude/memory/*.md    curated precedent and lessons
HANDOFF.md             temporary current-task transfer
```

Memory entries should be small and durable:

```text
RULE: Queue call transcripts use channel 1 for agent and channel 0 for customer.
NEVER: Edit generated files under src/generated directly.
PREFER: Use pnpm, not npm, in this repo.
FACT: Backend tests require Docker Compose for Postgres.
```

Do not commit `.claude/memory/` by default unless the team has reviewed it as shareable repository documentation.

## Swarm audits and workflows

`/audit-swarm` runs specialist lanes and synthesizes the evidence:

```text
repo-scout
  ├─ security-auditor
  ├─ architecture-auditor
  ├─ scalability-auditor
  └─ quality-auditor
        ↓
 synthesis + spot verification + not-covered lists
```

Where Claude Code Workflows are available, MaaawKit can use that style for fleet-scale orchestration. Where they are not available, the same audit degrades to parallel specialist agents or manual phase execution.

## Security model

MaaawKit is intentionally conservative:

- hooks fail open if the hook implementation itself errors,
- destructive operations are denied or require confirmation,
- verification loop files require `trusted: true`,
- repo-local loop files tracked by Git are refused,
- Codex write tasks run in isolated worktrees,
- Codex hooks require `/hooks` review/trust,
- secrets and private keys are treated as protected paths.

Read `SECURITY.md` before using MaaawKit in sensitive repositories.

## Development

Run local checks:

```bash
python tools/validate.py
python plugins/maaaw-kit/hooks/selftest.py
```

Package layout:

```text
plugins/maaaw-kit/
  agents/
  commands/
  hooks/
  scripts/
  skills/
  templates/
docs/CODEX.md
tools/validate.py
```

Release hygiene checked by `tools/validate.py`:

- JSON validity
- balanced Markdown fences
- skill/agent/command frontmatter
- skill name matches directory
- README/marketplace count drift
- placeholder repository metadata
- Codex hook template shape

## Philosophy

MaaawKit does not try to make agents magical. It gives them a tighter operating system:

```text
Understand the repo.
Plan before changing.
Change narrowly.
Verify honestly.
Remember what mattered.
Delegate safely.
```
