---
name: quick-audit
description: Fast, timeboxed "smoke audit" of a codebase or PR — the honest half-assed version that finds the scariest 20% in minimal time and explicitly declares what it did NOT check. Use when the user wants a quick look, sanity check, gut check, "anything scary in here?", vibe check of a repo, or pre-merge once-over — anything where a full audit is overkill.
---

# Quick Audit (a.k.a. the honest half-assed audit)

The point of a quick audit is not lower standards — it's narrower scope, declared openly. It answers one question: **"what's most likely to hurt us?"** in ~10 minutes of work, and it always ends with a NOT-CHECKED list so nobody mistakes it for a full audit.

## The fixed 15-minute checklist (do exactly this, resist rabbit holes)

1. **Does it build & test?** (2 min) Run the repo's build + test commands. Failing = automatic top finding, stop digging into why beyond the first error.
2. **Secrets scan** (2 min): `git grep -inE "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}"` and `git ls-files | grep -iE "\.env|secrets|\.pfx|\.pem"`. Anything hit → 🔴.
3. **The scary greps** (3 min) — one pass per applicable language:
   - SQL/shell built from strings: `FromSqlRaw|Invoke-Expression|eval\(|exec\(|child_process|os\.system`
   - Swallowed errors: `catch\s*(\(\w*\))?\s*\{\s*\}` , `except.*:\s*pass`
   - Async foot-guns: `\.Result\b|\.Wait\(\)|GetAwaiter\(\).GetResult`
   - React/Next: `dangerouslySetInnerHTML|NEXT_PUBLIC_.*(KEY|SECRET|TOKEN)`
4. **Hotspot skim** (4 min): open the 3 largest and 2 most-recently-churned source files. Skim for: god-functions, copy-paste blocks, TODO/FIXME/HACK density (`git grep -c "TODO\|FIXME\|HACK"`). Judgment sample, not analysis.
5. **Dependency red flags** (2 min): one vulnerability scan (`npm audit --omit=dev` / `dotnet list package --vulnerable` / `pip-audit`), note counts only, and check for EOL runtime versions.
6. **Test smell sniff** (2 min): count test files vs source files; open one test — does it assert real behavior? Any `Sleep`/`skip` epidemic (`git grep -c "skip\|Sleep\|sleep("` in tests)?

## Report format (fits on one screen — that's the contract)

```
# Quick audit: <repo> (timeboxed — NOT a full audit)
Verdict: 🔴/🟠/🟢 — one sentence.
Top findings (max 5, evidence file:line each)
Quick wins (max 3 — fixable in <1h each)
NOT CHECKED: authz logic, business correctness, architecture, perf,
  full dep tree, git history, <anything skipped> 
→ Recommend full audit if: <specific trigger, or "not needed">
```

## Rules
- Timebox is real: when a grep result looks deep, log it as a finding with "needs full audit" and MOVE ON. The quick audit that turns into a 2-hour dive is the worst of both worlds.
- The NOT-CHECKED section is mandatory and honest — it's what makes half-assed acceptable. Omitting it converts a quick audit into a lie.
- Never say "the codebase is secure/clean" from a quick audit. Say "nothing scary surfaced in the sampled checks."
