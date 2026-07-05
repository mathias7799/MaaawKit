---
name: deep-thinking
description: Structured planning before non-trivial implementation. Use whenever a task involves 3+ files, a new feature, an architectural decision, a migration/refactor, ambiguous requirements, or anything the user calls "complex", "important", or "production". Also use when the user asks to "plan", "think through", "design", or "architect" something. Plan BEFORE touching code.
---

# Deep Thinking / Planning

**Declare your read first**: open with a one-line interpretation of the request; ask at most ONE clarifying question, and only when interpretations genuinely diverge.

Cheap tokens spent planning save expensive tokens spent rewriting. But planning theater is worse than no plan — every step below must produce a decision, not prose.

## When to plan vs. just do it

- **Just do it**: single-file changes, clear bug fixes, mechanical refactors, anything reversible in one commit.
- **Plan (this skill)**: new features, cross-cutting changes, schema/API changes, anything with an irreversible step, anything where you'd need to ask "which approach?"

## The planning sequence

### 1. Restate the goal as an acceptance test
One paragraph: "This is done when ___ [observable behavior], verified by ___ [command/test]." If you can't write the verification, you don't understand the task — ask the user now, not after implementing.

### 2. Reconnaissance before design
Read the actual code before proposing anything. Minimum recon: entry points touched, existing patterns for similar features (copy the house style), test setup, build commands. List what you found — a plan built on assumed code structure is fiction.

### 3. Enumerate 2–3 approaches — then kill two
For each: one-line description, main risk, blast radius (files touched). Pick one and say WHY in one sentence. Never present options without a recommendation. If two approaches are genuinely close, pick the one that's easier to reverse.

### 4. Identify the "load-bearing" decision
Every plan has one decision that's expensive to change later (schema, public API shape, state model, dependency choice). Name it, spend your thinking there, and confirm it with the user if there's real doubt. Everything else can be adjusted mid-flight.

### 5. Slice into verifiable increments
Break work into steps where each step leaves the codebase compiling and tests green. Each step: what changes + how it's verified. Order so the riskiest/most-uncertain step happens FIRST (fail fast), not last. 3–7 steps; if more, the task should be multiple sessions.

### 6. Pre-mortem (30 seconds)
"It's a week later and this change caused an incident — what was it?" Top 2 candidates get a mitigation in the plan (a test, a feature flag, a rollback note).

## Output format

```
GOAL: <done-when + verification command>
RECON: <what the code actually looks like, key files>
APPROACH: <chosen> — because <reason>. Rejected: <A> (<why>), <B> (<why>)
LOAD-BEARING: <the one hard-to-reverse decision>
STEPS:
  1. <change> → verify: <command>
  2. ...
RISKS: <top 2 + mitigation>
```

Then STOP and get user confirmation if: the load-bearing decision is uncertain, the plan deletes/migrates data, or scope grew beyond what was asked. Otherwise proceed.

## During execution

- Re-check the plan after each step; if reality diverges (it will), update the plan explicitly rather than improvising silently.
- Scope creep check at every step: "was this in the plan?" If not, note it for the user instead of doing it.
- If step N fails twice, return to this skill's step 3 — the approach may be wrong, not the code.
