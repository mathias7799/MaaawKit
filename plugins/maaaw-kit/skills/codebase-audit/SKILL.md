---
name: codebase-audit
description: Structured audit of a codebase at a configurable depth (quick smoke pass, standard, or deep) — security, correctness, architecture, dependencies, tests, operational readiness — producing a prioritized findings report. Use when the user asks for an audit, health check, quality/security review, tech-debt assessment, "how bad is this repo", "anything scary in here?", sanity check, due diligence, or a pre-merge once-over.
---

# Codebase Audit

For parallel execution across specialist agents, use /audit-swarm (orchestration skill) — this document defines the phases, severity rules, and report format either way.

## Depth dial (kit.json `dials.auditDepth`, or the user's words)
- **quick** — the timeboxed smoke pass: run `references/quick-pass.md` exactly (15-minute checklist, one-screen report, mandatory NOT-CHECKED list). /quick-audit forces this depth.
- **standard** (default) — all phases below, sampled hotspots rather than exhaustive sweeps.
- **deep** — all phases exhaustively + git-history archaeology; pair with `dials.paranoia: high` to escalate every ask-level guard rule and double-verify findings.

An audit is evidence-based: every finding cites file:line or a command output. No finding without evidence, no severity without impact reasoning. If the repo is large, parallelize phases across subagents (orchestration skill) and synthesize.

## Phase 0 — Scope & inventory (always first)
- Establish facts: languages, frameworks, entry points, LOC (`git ls-files | wc -l`, cloc if available), test count, last commit activity (`git log --oneline -20`, `git shortlog -sn | head`).
- Ask/confirm the audit's purpose (shipping? inheriting? security-driven?) — it changes severity weighting.
- Write the inventory at the top of the report; misidentified stack = worthless audit.

## Phase 1 — Does it even work?
Run in order, record raw results: build, tests, lint/type-check (use the repo's own scripts, else the coding-standards skill's per-language commands). A repo that doesn't build cleanly gets that as Finding #1 and colors everything after.

## Phase 2 — Security sweep (evidence: grep + read)
- Secrets: `git grep -iE "(api[_-]?key|secret|password|token|connectionstring)\s*[:=]"` + check `.env*` files tracked in git (`git ls-files | grep -i env`) + git history for removed secrets if suspicious.
- Injection: string-built SQL (`FromSqlRaw`, f-string/interpolated queries), shell-outs with user input, `eval`/`Invoke-Expression`, `dangerouslySetInnerHTML`, unparameterized `exec`.
- AuthZ: find endpoints/handlers; check each mutating one for auth *and* authorization (owning-the-resource checks, not just logged-in checks).
- Input boundaries: deserialization of untrusted data, path traversal (`Path.Combine` with user input, `../`), file uploads without type/size limits.
- Dependencies: `npm audit` / `dotnet list package --vulnerable --include-transitive` / `pip-audit` / `uv pip list --outdated`. Note EOL runtimes (.NET < 8, Node < 20, Python < 3.10).

## Phase 3 — Correctness & robustness
- Error handling: empty catch blocks (`git grep -A1 "catch"` sampling), swallowed promise rejections, missing `$ErrorActionPreference`/StrictMode in PS scripts, bare `except:`.
- Concurrency: sync-over-async (`.Result`, `.Wait()`), shared mutable state, missing cancellation tokens on long operations, race-prone check-then-act patterns.
- Resource leaks: undisposed IDisposable, unclosed files/connections outside context managers/`using`.
- Data: migrations irreversible? timestamps without timezones? money as float?

## Phase 4 — Architecture & maintainability
- Dependency direction: do modules layer cleanly or is it a tangle (sample the imports of 5 core files)?
- Hotspots: largest files (`git ls-files | xargs wc -l | sort -rn | head`), most-churned files (`git log --format= --name-only | sort | uniq -c | sort -rn | head`) — churn × size = risk.
- Duplication: sample for copy-paste blocks across the hotspots.
- Config: hardcoded environment-specific values, config validated at startup or exploding at runtime?

## Phase 5 — Tests & operability
- Coverage of *critical paths* (auth, payments, data mutation) — not the percentage number.
- Test quality sample: read 5 tests; do they assert behavior or mock-echo the implementation? Any sleeps/order dependence?
- Operability: structured logging or Console.WriteLine? Health endpoints? Can you tell from logs *why* a request failed? Secrets in logs?

## Report format (always this structure)
```
# Audit: <repo> — <date>
## Verdict (3 sentences max: overall risk level + the one thing to fix first)
## Inventory (stack, size, activity, build/test status)
## Findings
### 🔴 Critical (exploitable / data-loss / broken build) — fix before anything else
### 🟠 High (will cause incidents)
### 🟡 Medium (slows development, risk under change)
### 🟢 Low / hygiene
Each finding: [ID] Title — file:line — evidence — impact — concrete fix (effort: S/M/L)
## What's actually good (be fair; 3–5 items)
## NOT CHECKED / out of scope (mandatory — same honesty rule as quick-audit)
## Recommended sequence (ordered top-10 actions, dependencies noted)
```

Rules: severity = impact × likelihood, not personal taste (style nits are 🟢 no matter how ugly). Cap at ~25 findings — group repeated instances of the same pattern into one finding with a count. Never pad with speculative findings to look thorough; "Phase 3 came back clean" is a valid result.
