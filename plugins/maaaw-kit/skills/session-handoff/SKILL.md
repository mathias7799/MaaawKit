---
name: session-handoff
description: Preserve working state across Claude Code sessions by writing a structured HANDOFF.md before context runs out or the session ends. Use when a task will span multiple sessions, when context is getting long, when the user says "handoff", "save state", "continue tomorrow", "we're running out of context", or before /compact on a complex task. Also governs how to RESUME from an existing HANDOFF.md.
---

# Session Handoff

Context windows end; work doesn't. A handoff is you briefing your amnesiac successor (the next session's Claude). The test of a good handoff: the next session can resume productive work within 2 minutes without re-exploring the repo or re-litigating decisions.

## When to write one
- Context feels heavy on a multi-step task (don't wait for the wall — quality degrades before you hit it)
- End of a work session with the task unfinished
- Before risky operations you might want to resume from
- The moment a loop budget exhausts with failures remaining
- Before handing off to another agent (the codex-handoff skill builds on this file)

## HANDOFF.md format (write to repo root; overwrite previous)

```markdown
# Handoff — <task> — <date> <time>
<!-- delete this file when the task is fully done -->

## Goal & oracle
<one line goal> | done when: `<verification command>` passes

## State: where things stand
- DONE: <completed steps, each with evidence — "commit abc123", "test X passes">
- IN PROGRESS: <the exact step underway + the precise next action, e.g.
  "wiring OrderService.Cancel — next: add the idempotency check at OrderService.cs:214">
- NOT STARTED: <remaining planned steps>

## Decisions made (do NOT re-litigate)
- <decision> — because <reason>   (these were settled; re-deciding wastes the next session)

## Landmines discovered
- <thing that looks wrong but is intentional / trap that cost time / flaky test / gotcha>

## Current failure state (if mid-debug)
- Command: `<repro>` — Output: <the actual error, trimmed>
- Hypotheses tried: <H1: result, H2: result>  ← saves the successor from repeating them

## Files touched
<list — helps the next session scope its reading>
```

## Rules for writing
- **Evidence over narrative.** "Auth works" is useless; "auth integration test passes as of commit abc123" is a checkpoint.
- **The IN PROGRESS line is the most valuable sentence in the file.** Make the next action so precise it could be executed without thinking (file:line, exact command).
- Hypotheses-already-tried in debugging handoffs prevent the most expensive failure mode: the next session cheerfully re-trying the same three fixes.
- Commit before handing off (WIP commit is fine: `wip: <state> — see HANDOFF.md`). An uncommitted handoff can be destroyed by one bad session start.
- Keep it under a page. A handoff nobody reads is a diary.

## Rules for resuming (the SessionStart hook flags HANDOFF.md automatically)
1. Read HANDOFF.md fully before touching anything.
2. Verify the claimed state — run the oracle/tests it mentions. Trust but verify: the previous session may have been optimistic.
3. Honor "Decisions made" unless you find concrete evidence one is wrong — in which case say so explicitly to the user before deviating.
4. Continue from IN PROGRESS. When the task fully completes: delete HANDOFF.md (a stale handoff is disinformation).
