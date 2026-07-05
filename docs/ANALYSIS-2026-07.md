# Full repo analysis + reference-repo comparison (2026-07-05)

Nine parallel deep reviews: three on this repo (engine correctness/security,
content/docs, tests/CI/packaging) and one per reference repo (taste-skill,
pm-skills, agency-agents, codex-plugin-cc, agentskills spec, mattpocock/skills
— note: the "skills-main" zip is Matt Pocock's kit, not Anthropic's).

## Verdict

The engine core is sound — pure decision logic, trust-gated loop files,
atomic writes, generated-fallback drift gates, honest docs. The review found
**one critical inconsistency** (the trust model stops at the loop file and
doesn't cover `.agent/bridge/` configs), **one potentially fatal wiring bug**
(hooks.json format), a handful of real correctness bugs, and a set of
distribution mistakes that are security-relevant (npm name confusion).
Reference repos validate our architecture (nobody else combines enforcement +
memory + bridge) but supplied a concrete steal list.

## A. Defects found in this repo (fixed in the follow-up commits unless marked backlog)

### P0
1. **hooks.json entry format** — used `command + args[]`, which Claude Code's
   hook schema doesn't define (documented shape: single `command` string). If
   `args` is ignored, every hook silently fails open → the entire safety layer
   never fires. FIXED: single command strings, matcher cleaned.
2. **`.agent/bridge/` executes without a trust gate** (cloned-repo attack):
   `adapters.json` can set `bin: bash, baseArgs: [-c, …]` and `maaaw doctor` /
   `bridge detect` execute it; a committed job JSON + `.exit` file can make
   `bridge status` run an attacker oracle with `shell:true`. Inconsistent with
   the loop-file trust gate. FIXED: git-tracked `adapters.json` is ignored
   (builtin specs only, surfaced by doctor); adapter argv is guard-screened
   before any probe/run; oracles from job records are guard-screened and
   refused when the job file is git-tracked.
3. **npm name confusion** — README/MCP.md/MIGRATION said `npx maaaw …`, but the
   package is `maaawkit`; `npx maaaw` would install a squattable foreign
   package. FIXED everywhere (`npx -y maaawkit …`).
4. **Codex adapter flags unverified/wrong** (per the codex-plugin-cc reference,
   which uses the `app-server` JSON-RPC protocol, not `codex exec`): `-o` is
   suspect (real flag `--output-last-message`); resume hint is `codex resume
   <threadId>`. FIXED: `--output-last-message`, notes + verifiedAgainst updated
   honestly; sandbox mode names were confirmed correct. App-server integration
   is backlog (B7).

### P1
5. `withLock` stale-lock takeover let two waiters win simultaneously. FIXED
   (takeover now re-races the atomic mkdir instead of write+break).
6. Guard `rm -rf` regex missed `rm -rf /*`, `rm -rf ~/`, `rm -rf $HOME/`, and
   `--recursive --force` long flags. FIXED + tests.
7. PowerShell post-edit check interpolated the file path into a single-quoted
   PS string → injection via `'` in a filename. FIXED (quote doubling).
8. `reconcileJob` wasn't serialized → double finalize / double oracle run.
   FIXED (exit-file handling under the job lock).
9. `globToRegExp("src/**/foo")` required an intermediate segment (missed
   `src/foo`), and a literal space in a glob leaked the placeholder. FIXED.
10. Latency-budget tests would flake on Windows CI. FIXED
    (`MAAAW_LATENCY_FACTOR` set per-OS in CI).
11. The stdout-result path (5 of 6 adapters!) was untested; `runHook`'s
    fail-open catch and default post-edit runner untested. FIXED (tests added).
12. Release workflow published alphas to the `latest` dist-tag and never
    asserted tag == package version. FIXED.
13. `rulesDrift`/`rules sync` rewrote every artifact daily (generated-date
    inside the managed block). FIXED (stable version stamp).
14. Shim guard fallback missed `NotebookEdit` (engine covered it). FIXED in
    template + hooks.json matcher.
15. Content staleness: CONTRIBUTING.md was Python-era; leftover
    `.codex-plugin/plugin.json` (v2.6); session-handoff referenced the deleted
    codex-handoff skill; two competing finding schemas (audit-swarm-spec vs
    findings-report); test-writer's pasted contract; "Claude Code Workflows"
    presented as real; document.md unquoted YAML hint; README "(later) MCP";
    cross-plugin references unqualified. ALL FIXED.

### Backlog (real but deferred, in priority order)
- **B1** Memory writes lack locking (lost hit increments under concurrent
  recall; consolidate racing recall can resurrect an archived record) — route
  record+index writes through `withLock`; requires making recall async.
- **B2** Marker regions are fragile if a managed body ever contains the end
  marker (e.g. a hostile promoted-record body) — sanitize marker strings out
  of block bodies.
- **B3** Mixed zod entrypoints (`zod/v4` in schemas, `zod` v3 surface in MCP)
  — standardize when the MCP SDK supports v4 cleanly.
- **B4** `renderLaunchCommand` prints POSIX `cat … |` (cosmetic on Windows).
- **B5** doctor failure-branch tests; corrupted job/index recovery tests;
  Windows EBUSY rmSync retries in test cleanup.
- **B6** Global `npm i -g maaawkit` may not be resolvable from plugin-dir shims
  (`import("maaawkit/hooks")` resolves from the shim's location) — verify on a
  real machine; likely needs a resolution fallback (try global root) or a
  documented local-install recommendation.
- **B7** Codex `app-server` JSON-RPC adapter mode (streaming, `outputSchema`
  structured verdicts, `turn/interrupt` graceful cancel, reasoning-effort
  passthrough) — the gold-standard integration path; large but high value.
- **B8** Sourcemaps + shim templates ship in the npm tarball (~630KB bloat).

## B. Steal list from the reference repos

Adopted now (cheap, high value):
- **agentskills spec**: frontmatter allow-list (reject unknown keys), full
  name rule (charset/length/hyphens), description ≤1024 / compatibility ≤500
  caps → `maaaw validate`. Keeps skills portable to every spec client.
- **pm-skills**: CHANGELOG format + version-sync test (newest CHANGELOG
  heading == package.json == both plugin.json == marketplace.json).
- **taste-skill**: dial signal→value inference table in codebase-audit.
- **agency-agents**: honest per-tool capacity awareness already existed
  (AGENTS 24KB); adopted `command -v` binary probing into placement detection
  via doctor cross-reference (backlog for full catalog, see below).

Backlog steals (tracked, not yet built):
- **S1 (pm-skills)** CHANGELOG-driven auto-tag/release workflow (push-range
  diff, backfill-safe, awk-extracted notes).
- **S2 (agency-agents)** Single-source tool catalog (`tools.json`-style)
  unifying `CONVERT_TARGETS` + `BUILTIN_ADAPTERS` with a CI drift gate;
  user-scope installs (`~/.claude/...`) with per-tool env overrides; more
  placement formats (codex TOML agents, aider CONVENTIONS.md, portable
  SKILL.md export).
- **S3 (codex-plugin-cc)** Fake-CLI behavior matrix (auth-fail, invalid-json,
  slow/interruptible, subagent) for deterministic error-path tests;
  process-group kill (`kill(-pid)` / `taskkill /T /F`) in cancel;
  interrupt-then-kill for codex.
- **S4 (mattpocock/skills)** `writing-great-skills` meta-skill + glossary
  (predictability, leading words, no-op test, named failure modes); a
  `disable-model-invocation` router skill mapping the 16 skills into flows;
  Standards-vs-Spec two-axis review split (Spec axis = diff vs originating
  PRD — pairs with /prd); CONTEXT.md domain-glossary convention.
- **S5 (taste-skill)** `Override:` escape clauses on hard skill rules;
  per-level dial band definitions everywhere dials exist; "reality anchor"
  reference files for vendor CLI syntax in maaaw-bridge.
- **S6 (pm-skills)** description trigger-phrase lint as a warning channel in
  `maaaw validate` (needs a warnings concept first).

## C. What the references confirmed we do better
- Mechanical enforcement (hooks/oracle/validator) vs. every reference's
  honor-system prose — including OpenAI's own plugin, which has no general
  guard and no worktree isolation for write modes.
- Marker-managed idempotent installs vs. clobber-or-skip file placement.
- 8 engineered agents with model tiers + tool restrictions + machine-readable
  contracts vs. 233 unrestricted personas.
- A real MCP surface with deny-by-default writes (the codex plugin has none).
- Honest metadata culture (verifiedAgainst, NOT-CHECKED lists, ADR'd
  rejections) — none of the six references does this.
