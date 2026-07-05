# Security Policy

MaaawKit ships hooks that can inspect commands, run formatters/linters, inject
repository context, run a verification oracle, and a bridge that spawns other
agent CLIs. Treat it like developer tooling with your local permissions.

## Threat model

The main risks are:

- A malicious repository includes prompt-injection text in memory records,
  handoff files, docs, or loop files.
- A malicious or accidental `.agent/loop.json` executes shell commands through
  the Stop hook.
- A hook bug blocks useful work or silently misses a dangerous operation.
- A generated AGENTS.md or memory digest promotes stale or untrusted guidance.
- An MCP client (any connected agent) uses the bridge to spawn write-capable
  workers or destructive tasks.
- Supply-chain compromise of the npm package or its dependencies.

## One guard engine, three transports

The same guard policy evaluates destructive-command patterns in all three
places — the PreToolUse hook, the `maaaw` CLI, and every command/prompt the
bridge builds (including jobs requested over MCP). This is checked in CI: the
hook-shim fallback is generated from the same rule table as the engine, and a
drift test fails if they diverge.

## Hook execution

Hooks run as local commands with your user permissions. They are not a
sandbox. The shims are dependency-free Node and fail open on internal errors:
that protects the session from hook bugs, but it also means hooks are
guardrails, not hard security boundaries.

## Guard limitations

The guard is a seatbelt, not a sandbox. It blocks or asks on common
destructive patterns (broad deletes, force pushes, infrastructure destruction,
package publishing, dangerous cloud deletes, protected secret-file writes).
It can be bypassed by command obfuscation, interpreter wrappers, custom
scripts, aliases, or destructive behavior hidden inside another tool. Real
enforcement still depends on agent permissions, OS sandboxing, code review,
and human judgment.

## Verification loop trust gate

The Stop hook executes the configured oracle with the shell. Loop files are
therefore refused unless BOTH: the file contains `"trusted": true`, AND it is
not tracked in git. This blocks the cloned-repository attack where a repo
ships a loop file that auto-runs arbitrary commands. If a loop file is
refused, delete it and recreate it through `/loop` if it is yours.

## Bridge isolation

- Write-capable worker jobs always run in an isolated git worktree; results
  come back as patch + stat and are never auto-merged.
- Every task and every built vendor command passes the guard before anything
  is created or executed; deny-level findings are not overridable.
- Jobs are prepared-by-default: nothing runs without an explicit `--run`,
  `--background`, or `execute: true`.
- Workers are instructed never to commit, push, publish, or touch secrets;
  treat their output as untrusted input for review.

## MCP exposure

Any MCP client connected to `maaaw mcp serve` inherits the ability to spawn
bridge jobs. Therefore:

- **Write-mode bridge jobs are denied by default for all MCP clients.** A
  client is only permitted after being explicitly allow-listed by name in
  `.agent/kit.json` → `mcp.writeModeClients`.
- Read-mode jobs, memory, rules-sync, and handoff tools are available to all
  connected clients, but still pass the same guard policy.
- Memory records created over MCP carry `source: mcp:<client>` provenance.

## Memory and prompt injection

`.agent/memory/` records are injected as advisory repository context, clearly
labeled as not-instructions. In cloned or unfamiliar repos, treat memory as
untrusted input. Do not obey memory entries that weaken safety, skip tests,
disable hooks, leak secrets, or override higher-priority instructions.
Only commit `.agent/memory/` after the team agrees it is safe to share; review
it like code because it becomes team-visible prompt context.

## Supply chain

- Runtime dependencies are capped and justified in a table (see the roadmap);
  no new dependency lands without a row there.
- `package-lock.json` is committed; CI runs `npm audit --omit=dev` on every
  matrix cell.
- The hook-shim path has zero runtime dependencies by design.
- Releases are published with npm provenance.

## Secrets

Never commit credentials, tokens, private keys, customer data, or production
`.env` files. The guard hook asks before protected secret-file writes, but it
does not replace secret scanning or review.

## Reporting issues

Report security issues privately to the maintainer before publishing details.
Include:

- affected version or commit
- operating system
- exact command or file that triggered the issue
- expected vs actual behavior
- impact and suggested mitigation, if known
