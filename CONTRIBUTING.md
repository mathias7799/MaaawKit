# Contributing

## Ground rules
- Hooks must be pure-stdlib Python 3.10+, cross-platform (CI runs Ubuntu + Windows), and fail open — a hook bug must never break someone's session (`try/except` around stdin parsing, exit 0 on internal errors).
- Every hook behavior change needs a selftest case in `plugins/maaaw-kit/hooks/selftest.py`. Every guard rule needs both a positive (blocked) and negative (allowed) case — false positives are bugs, not caution.
- Skills follow the house style: frontmatter `name` matches the directory; `description` is written for the triggering model (concrete trigger phrases, when-to and when-NOT-to); body teaches judgment with rules + anti-patterns, not essays. Keep SKILL.md under ~120 lines; overflow goes to `references/`.
- Docs claims must be executable: any command written in a README/skill must actually run.

## Before opening a PR
```
python tools/validate.py                         # structure, frontmatter, JSON
python plugins/maaaw-kit/hooks/selftest.py
```
Both must pass on your machine; CI re-runs them on Ubuntu and Windows.

## Adding things
- New skill: `plugins/maaaw-kit/skills/<name>/SKILL.md` (+ optional `references/`). Add a matching command in `commands/` if it benefits from explicit invocation.
- New guard rule: add to `BASH_RULES` in `hooks/guard.py` with `deny` only for unambiguous destruction; prefer `ask`. Add selftest cases.
- Version bumps: update both `.claude-plugin/marketplace.json` and `plugins/maaaw-kit/.claude-plugin/plugin.json`, and add a CHANGELOG entry.
