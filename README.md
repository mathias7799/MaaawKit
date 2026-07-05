# MaaawKit

[![ci](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml) · MIT · Windows / macOS / Linux · Node ≥ 20

**MaaawKit 3.0** is a portable agent operating layer for any AI
Development Environment (ADE) or IDE. It gives Claude Code, Codex, Cursor,
VS Code/Copilot, Gemini, opencode, and future coding agents the same
cross-agent orchestration **bridge**, first-class project **memory**,
canonical **rules**, and mechanical **safety guardrails** — exposed through
an MCP server, a CLI (`maaaw`), generated tool-native instruction files, and
host adapters such as Claude Code hook shims.

MaaawKit's moat is mechanical discipline, not prompt volume:

- Guard rules live in one TypeScript data table; generated zero-dependency hook
  shims are drift-gated against that table.
- Bridge jobs are prepared by default, guard-screened before execution, and
  write-mode work happens in an isolated git worktree returned as patch/stat.
- Repo-local executable state is treated as untrusted when committed, so cloned
  `.agent/` files cannot silently relax policy or redirect bridge result reads.
- Memory is a lifecycle: captured records can be recalled, attached to handoffs,
  and promoted into canonical rules when they earn permanence.

```text
MCP-first integration · 16 portable skills · 4 policy hooks · 8 specialist agents · 17 workflows · 1 engine
```

## Why MaaawKit exists

AI coding sessions usually fail for the same reasons, no matter which ADE or
IDE is hosting the model:

- the agent starts implementing before understanding the repo,
- rules live in prose and get ignored under pressure,
- tests are skipped or weakened,
- long sessions lose context,
- handoffs between agents and humans are lossy,
- safety depends on the model "remembering" not to do dangerous things.

MaaawKit makes those responsibilities portable and mechanical:

```text
Engine      = bridge, memory, rules, guard policy — tested TypeScript, one implementation
MCP         = universal ADE/IDE control plane for memory, rules, bridge, and handoff
CLI         = local automation for setup, doctor, bridge, validation, and sync
Workflows   = reusable plans/reviews/audits rendered as commands or MCP flows
Hooks       = host event adapters where available; CLI/MCP preflight elsewhere
Agents      = focused specialist reviewers with machine-readable contracts
Memory      = schema-valid records with a real lifecycle, shared across agents
```

## Supported environments

MaaawKit is MCP-first and degrades gracefully: hosts with native hooks get
real-time guardrails; hosts without hooks still get the same engine through
MCP, CLI preflight, generated rules, and worktree-isolated bridge jobs.

| Environment | MCP | Rules/install artifacts | Memory | Hooks/events | Bridge | Native workflows |
|---|---:|---:|---:|---:|---:|---:|
| Claude Code | ✅ | ✅ | ✅ | ✅ hook shims | ✅ | ✅ slash commands |
| Codex CLI | ✅ | ✅ | ✅ | via MCP/CLI preflight | ✅ | via MCP/CLI |
| Cursor | ✅ | ✅ | ✅ | via MCP/CLI preflight | ✅ | via MCP |
| VS Code / Copilot | ✅ | ✅ | ✅ | via MCP/CLI preflight | ✅ | via MCP |
| Gemini CLI | ✅ | ✅ | ✅ | via MCP/CLI preflight | ✅ | via MCP/CLI |
| opencode | planned/CLI | ✅ | ✅ | via CLI preflight | ✅ | via CLI |
| Other ADEs/IDEs | MCP stdio | generated files | `.agent/` | host adapter or preflight | adapter-based | MCP/CLI |

## Install

### Universal MCP install (recommended)

Register the same server command in your ADE/IDE from the repo root:

```bash
npx -y maaawkit mcp serve
```

Then initialize the project state and verify the machine:

```bash
npx -y maaawkit init      # creates .agent/ state + kit.json in your repo
npx -y maaawkit doctor    # checks config, hooks, memory, rules, and adapters
```

See `docs/MCP.md` for registration snippets for Claude Code, Codex CLI,
Cursor, VS Code/Copilot, and Gemini CLI.

### Optional global CLI

```bash
npm install -g maaawkit
maaaw init
maaaw doctor --hooks
```

### Optional Claude Code native plugin

Claude Code can use the universal MCP server, plus native plugin packaging for
slash commands and hook shims:

```text
/plugin marketplace add maaaw/maaaw-kit
/plugin install maaaw-kit@maaaw-kit-marketplace          # core: skills, hooks, agents, memory
/plugin install maaaw-bridge@maaaw-kit-marketplace       # orchestration: /bridge, /cross-review, /rules-sync
```

Requirements:

- Node ≥ 20 (the engine and the hook shims)
- optional project tools are used only when present: `ruff`, `eslint`,
  `prettier`, `dotnet format`, `PSScriptAnalyzer`
- bridge agents (Codex, Gemini, …) require their vendor CLIs only when you
  actually delegate to them

## Quickstart

MCP-first hosts can ask for MaaawKit tools such as `memory_recall`,
`rules_sync`, `bridge_run`, and `handoff_write`. Claude Code users can also use
native commands:

```text
/kit-setup
```

Common workflows:

```text
/plan "Add idempotent webhook retries"
/review
/audit-swarm
/loop "green backend tests" --oracle "npm test" --max 10
/bridge "Audit backend retry flow" --agent codex --mode review-only --run
```

## The `.agent/` state standard

Vendor-neutral repo-local state, used identically by the CLI, the MCP server,
and the hooks:

```text
.agent/
├── kit.json            # config: guard level, oracle, dials, memory budget
├── loop.json           # active verification loop (written by /loop)
├── bridge/             # jobs/, logs/, results/, adapters.json overrides
├── memory/             # records/*.md + generated index.json + digest.md
├── handoff/            # HANDOFF.md + handoff.json
└── rules.md            # canonical rules source → compiled to all tool formats
```

Config resolution: package defaults < `~/.config/maaaw/config.json` <
`.agent/kit.json` < `MAAAW_*` env < CLI flags.

## Safety hooks

Four zero-dependency Node shims; each upgrades itself to full engine behavior
when `maaawkit` is installed, and falls back to behavior compiled from the
same rule table when it is not (fallback can never drift — CI proves it).

| Hook | Event | Purpose |
|---|---|---|
| `guard.mjs` | `PreToolUse` | Blocks or asks before destructive shell/Git/cloud/secret operations |
| `post-edit.mjs` | `PostToolUse` | Runs relevant format/lint checks after edits (engine only) |
| `stop-verify.mjs` | `Stop` | Enforces the `.agent/loop.json` verification oracle |
| `session-context.mjs` | `SessionStart` | Injects branch, dirty state, loop status, handoff, memory digest |

Examples of guarded operations:

```text
rm -rf /                  denied
git push --force main     denied
git reset --hard          ask
terraform destroy         ask
kubectl delete            ask
curl ... | sh             ask
writing .env/private keys ask
```

Guard levels (`.agent/kit.json`): `relaxed` · `standard` · `strict` (asks
become denies). Custom rules via `guardCustomRules`. Hooks are guardrails,
not a sandbox — read `SECURITY.md`.

## The bridge — delegate to any agent

The engine dispatches bounded worker jobs to other agent CLIs. Six built-in
adapters (codex, claude, copilot, cursor, gemini, opencode) plus overrides in
`.agent/bridge/adapters.json`.

```bash
maaaw bridge detect                      # which agent CLIs are installed
maaaw bridge run --agent codex --mode review-only \
  --task "Review the auth flow" --oracle "npm test"   # prepared by default
maaaw bridge run ... --run               # execute foreground
maaaw bridge run ... --background        # detached; poll with status
maaaw bridge status <id> | result <id> | cancel <id> | cleanup <id>
```

Safety model, enforced by the engine:

- **prepared-by-default** — broken vendor commands print, they don't run
- **guard policy inside the bridge** — every task and built command is screened
  before anything executes; destructive tasks are refused
- **write modes always run in an isolated git worktree** on an
  `<agent>/<slug>` branch; changes come back as patch + stat, the main tree is
  never touched; the oracle verdict is recorded
- **cancel kills the whole process tree**, Windows included
- `--resume <job-id>` continues vendor threads where supported

| Mode | Writes? | Use for |
|---|---:|---|
| `review-only` | No | reviews, findings, suggested patches |
| `security-pass` | No | focused security review |
| `implementation-worktree` | Yes, isolated | generic implementation attempt |
| `backend-task` | Yes, isolated | bounded backend changes |
| `test-fix` | Yes, isolated | reproduce/fix failing tests |

## Agents

MaaawKit includes 8 specialist agents:

| Agent | Role |
|---|---|
| `repo-scout` | Fast repo orientation with observation vs inference separated |
| `code-reviewer` | Read-only code review with file:line evidence |
| `bug-hunter` | Diagnosis and root-cause isolation |
| `test-writer` | Behavior-driven tests in the repo's framework |
| `security-auditor` | Secrets, injection, authz, boundaries, vulnerable deps |
| `architecture-auditor` | Dependency direction, hotspots, consistency, error strategy |
| `scalability-auditor` | N+1, unbounded work, timeouts, horizontal scaling blockers |
| `quality-auditor` | Build/test/lint evidence and test trustworthiness |

## Commands

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
/bridge         Delegate a bounded task to another agent CLI
/cross-review   Second model reviews the diff blind; you adjudicate
/rules-sync     Compile canonical rules into every agent file
/learn          Capture durable lesson
/memory         Inspect/curate memory
```

## Verification loop

```text
/loop "green after refactor" --oracle "dotnet build -warnaserror && dotnet test" --max 15
```

MaaawKit writes `.agent/loop.json` with a required trust flag. On every
attempt to stop, the Stop hook re-runs the oracle:

- green: loop dissolves with evidence,
- failing: Claude receives the failure output and keeps working,
- stalled (same failure 3×): forced re-plan instead of more patching,
- budget exhausted: honest not-done report.

The hook refuses untrusted or git-tracked loop files — a loop config from a
cloned repo is treated as hostile input.

## Memory

Memory is data with a lifecycle, not prose a skill promises to maintain.
One markdown record per file under `.agent/memory/records/` (frontmatter +
body, git-diffable), a generated retrieval index, and a budgeted session
digest ranked by recency × confidence × hits × path overlap with your recent
changes. High-confidence, repeatedly-hit lessons get promoted into
`.agent/rules.md` — memory is the nursery; rules are the constitution. The
digest travels with handoffs and converted AGENTS.md, so every agent starts
with the same project lessons.

## Security model

- hooks fail open if the hook implementation itself errors,
- destructive operations are denied or require confirmation — identically in
  hooks, CLI, and (later) MCP, because it is one guard engine,
- verification loop files require `trusted: true` and must be untracked,
- bridge write jobs run in isolated worktrees; workers must not commit/push,
- secrets and private keys are protected write paths,
- runtime dependencies are capped, locked, and audited in CI.

Read `SECURITY.md` before using MaaawKit in sensitive repositories.

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm test
npm run build && node dist/cli/main.js validate
maaaw doctor --hooks
```

Repository layout:

```text
src/          # engine: bridge/ hooks/ memory/ convert/ schemas/ config/ state/ cli/ mcp/
shims/        # zero-dep hook shims (generated from templates + rule table)
plugins/maaaw-kit/     # core content: skills, agents, commands, hook shims
plugins/maaaw-bridge/  # orchestration content: bridge/handoff/cross-review skills
schemas/      # exported JSON Schemas (generated, committed)
tests/        # porting specs + integration tests (fake agent CLIs)
docs/         # roadmap status, architecture notes
```

`maaaw validate` checks: JSON validity, balanced fences, frontmatter, skill
name/directory match, command→skill cross-references, README/marketplace
count drift, placeholder metadata.

## Philosophy

```text
Understand the repo.
Plan before changing.
Change narrowly.
Verify honestly.
Remember what mattered.
Delegate safely.
```
