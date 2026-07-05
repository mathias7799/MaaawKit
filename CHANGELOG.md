# Changelog

## 3.0.0-alpha.0 — 2026-07-05 — the TypeScript engine (clean break from 2.6)

One TypeScript engine (`maaawkit` on npm, `maaaw` CLI) with content attached,
exposed as CLI + MCP server + zero-dependency hook shims. **No backwards
compatibility** — see docs/MIGRATION-3.0.md for the 2.6 → 3.0 map.

- **Engine**: Node ≥20 ESM, strict TS; zod domain schemas with committed JSON
  Schema exports; layered config (defaults < user < .agent/kit.json < MAAAW_*
  env < CLI); vendor-neutral `.agent/` state standard with atomic, locked
  writes; `maaaw doctor` (env/config/state/hooks/memory/rules-drift/adapters).
- **Hooks**: four zero-dep .mjs shims (guard, post-edit, stop-verify,
  session-context) that upgrade to full engine behavior when `maaawkit` is
  installed; embedded fallback generated from the same rule table (CI drift
  gate); guard levels (relaxed/standard/strict) + custom rules from kit.json;
  Python hooks and selftest.py deleted.
- **Bridge**: adapter registry (codex, claude, copilot, cursor, gemini,
  opencode + adapters.json overrides), prepared-by-default jobs, background
  execution with tree-kill cancel, mandatory worktree isolation for write
  modes (patch+stat return), oracle verdicts, `--resume` thread plumbing, and
  guard policy screening every task and built command before anything runs.
- **Memory**: first-class subsystem — schema-valid markdown records with a
  lifecycle (capture/consolidate/decay/confirm/promote/archive), BM25-lite
  recall with hit tracking, budgeted session digest ranked by path overlap
  with changed files, promotion into `.agent/rules.md`.
- **Rules/convert/install**: one canonical model compiled into AGENTS.md,
  CLAUDE.md, .cursor/rules, copilot-instructions, GEMINI.md, .windsurfrules —
  marker-managed, backed up, idempotent; drift surfaced by doctor.
- **Handoff**: `.agent/handoff/HANDOFF.md` + schema-valid handoff.json
  carrying top path-relevant memory records.
- **MCP server**: `maaaw mcp serve` (bridge_*, memory_*, rules_sync,
  handoff_*) over the same core; write-mode bridge jobs deny-by-default with
  per-client opt-in.
- **Content**: split into `maaaw-kit` (11 skills, 8 contract-bearing agents,
  14 commands, 4 shims) and `maaaw-bridge` (5 skills, 3 commands); merges
  (quick-audit→codebase-audit, workflow-orchestration→orchestration), new
  agent-bridge/agent-handoff/cross-review/cross-model-prompting/rules-sync
  skills; dials; interview /kit-setup; chained commands.
- **Quality**: 238 tests (porting specs, integration vs fake agent CLIs,
  property tests, latency budgets), ≥80% line coverage gate on src/, 3-OS ×
  2-Node CI, `npm audit --omit=dev` gate, release workflow with npm
  provenance; `maaaw validate` enforces budgets, contracts, cross-refs, and
  count drift.

## 2.6.0 — 2026-07-02 — Codex worker delegation + README refresh
- Added `codex-worker` skill, `/codex-worker` command, and `scripts/codex-worker.py` for bounded Claude→Codex delegation during a live Claude Code session.
- Worker modes: `review-only`, `security-pass`, `implementation-worktree`, `backend-task`, and `test-fix`. Review modes use Codex read-only sandbox; write-capable modes create isolated git worktrees and mirror result/patch/stat files back to `.codex/results/`.
- Codex worker prompts enforce a strict result contract: status, summary, assumptions, changed files, verification run, findings/implementation notes, and Claude review items.
- `to-codex.py` now exports the `codex-worker` skill to `.agents/skills/`.
- README fully rewritten around the MaaawKit operating model, quickstart, Codex worker flow, safety model, and development workflow.

## 2.5.0 — 2026-07-02 — hardening + Codex-native export
- Trust-gated verification loops: stop-verify refuses (warns, never executes) loop files lacking `trusted: true` or tracked in git; per-loop `timeout_seconds`/`max_output`; run timestamps; mechanical stall detection via failure signatures (3 identical -> re-plan instruction); reads `.claude/loop.json` or `.codex/loop.json`.
- Codex compatibility as a first-class export (docs/CODEX.md): AGENTS.md with start/end + lessons managed blocks (legacy markers migrated, human content preserved, 24KB budget warning), templated `.codex/brief.md`, `--install-skills` -> `.agents/skills/` with managed markers, `--write-config`, optional `--install-hooks` (Codex event-keyed hooks.json, trust-review required), `--dry-run`/`--force`/`--repo-root`/`--skills-source`/`--preserve-existing`; Codex subagent templates. Claude Code plugin behavior unchanged.
- Hooks: exec-form `args` + statusMessage; Stop timeout 630s default with per-loop override; guard adds git push --mirror (deny), branch -D / tag -d / docker prune / kubectl delete / az group delete / terraform+pulumi destroy (ask); fixed C# post-edit check never reporting unfixable issues; MultiEdit-defensive file_path handling.
- Memory: separate md file per concern incl. new strategies.md (STRATEGY/FAILED entries) with topic-file splitting guidance; injection explicitly framed as advisory/untrusted-in-cloned-repos; promotion safety rules (no secrets/logs/unverified repo text).
- Docs-drift CI check (README/marketplace counts vs actual dirs); marketplace metadata (displayName, license, keywords, repository); selftest suite expanded (trust gate, stall detection, skills copy, dry-run, marker idempotency).

## 2.4.0 — 2026-07-02
- Audited against official docs (code.claude.com, openai/codex, anthropics/skills). Verified compliant: PreToolUse/Stop hook output contracts, plugin hooks.json wrapper format, ${CLAUDE_PLUGIN_ROOT}, marketplace layout, skill frontmatter, Codex config.toml claims (approval_policy/sandbox_mode/network_access).
- Guard now covers the Windows-native PowerShell tool (matcher + handler + selftest cases; 32 checks).
- Added official permissions.deny secret-read block to manual-install settings (layered with the guard).
- Codex Skills interop: Codex supports Agent Skills with repo-scoped `.agents/skills/` discovery and skill-installer support — codex-handoff skill and briefing now route standards via installable skills, with AGENTS.md as baseline.
- Documented that session-context deliberately fires on startup|resume|clear|compact (memory re-injection after compaction).

## 2.3.0 — 2026-07-02
- Swarm audits: /audit-swarm fan-out (security/architecture/scalability/quality auditor agents, model: sonnet, read-only, structured reports) with synthesis + spot-verify phases.
- Claude Code Workflows guidance where available: workflow-orchestration skill (phase design, structured outputs, worktree isolation, deterministic-script rules) + shared per-finding JSON schema in references/audit-swarm-spec.md; graceful fallback to parallel Task calls.
- Usability: /kit-setup repo bootstrapper (recon-verified CLAUDE.md, memory dir, oracle detection), model-tiering guidance in orchestration skill, comprehensive README rewrite.

## 2.2.0 — 2026-07-02
- Full audit pass: fixed guard false positives (`format c:` in echo/commit text, SQL keywords in commit messages), gated eslint/prettier on repo config presence to prevent noise in unconfigured repos, removed reliance on `${CLAUDE_PLUGIN_ROOT}` expansion inside command markdown.
- Open-source scaffolding: MIT license, CI (Ubuntu+Windows × Python 3.10/3.12: validate + 30-check selftest + compileall), `tools/validate.py`, CONTRIBUTING, SECURITY.
- Selftest grown to 30 checks with regression cases for all fixed bugs.

## 2.1.0 — 2026-07-02
- Memory & auto-learning: memory-and-learning skill, `/learn`, `/memory`, SessionStart memory injection (budget-capped), lessons carried into AGENTS.md on Codex handoff.

## 2.0.0 — 2026-07-02
- Repackaged as an installable Claude Code plugin (marketplace layout).
- Codex handoff: codex-handoff skill, `/to-codex`, `scripts/to-codex.py` (idempotent AGENTS.md management + briefing generation).
- SessionStart context hook, session-handoff skill, repo-scout agent, hook selftest.

## 1.0.0 — 2026-07-02
- Initial kit: coding-standards (+4 language refs), deep-thinking, debugging, orchestration, verification-loop, codebase-audit, quick-audit, grill-me, vibe-to-prd, codebase-documenter skills; guard/post-edit/stop-verify hooks; reviewer/bug-hunter/test-writer agents; core commands.
