---
name: orchestration
description: How to decompose work and delegate to subagents (Task tool) effectively in Claude Code. Use for large multi-part tasks, parallel research, codebase-wide analysis, running independent workstreams, or when the user mentions agents, subagents, parallelization, "do these in parallel", or a task clearly bigger than one context window.
---

# Orchestration & Subagents

Subagents have their own context window and return only their final report. That's the whole game: **protect the main context, parallelize independent work, and get back summaries instead of raw exploration.**

## When to delegate vs. do it yourself

Delegate when:
- **Search/analysis that burns context**: "find every place X is used", "understand how auth works in this repo", reading large logs. The subagent reads 50 files; you receive 20 lines.
- **Independent parallel workstreams**: 3 unrelated bugs, research on 4 libraries, reviewing 5 PR files. Launch in ONE message so they run concurrently.
- **Isolation is a feature**: a risky experiment, a review that should be unbiased by your implementation context.

Do it yourself when:
- The task needs the conversation's accumulated context (subagents don't have it and you'd spend more tokens briefing than doing).
- Steps are sequential and each depends on the last edit.
- It's small. Spawning an agent for a 2-file change is pure overhead.

## Writing subagent prompts (this is where orchestration fails)

A subagent knows NOTHING about your conversation. Every prompt must be self-contained:

1. **Context**: repo path, what the project is, relevant constraints (one short paragraph).
2. **Task**: precise, bounded, with explicit non-goals ("do NOT modify tests", "analysis only, no edits").
3. **Verification**: the command that proves success ("run `dotnet test`, include the output").
4. **Report format**: exactly what to return — "return: list of file:line locations + one-line explanation each, max 30 lines". Unspecified report format = a rambling essay you have to re-read.

Rule of thumb: if your subagent prompt is under 5 lines, it will fail or return junk.

## Parallelization rules

- Independent tasks → single message, multiple Task calls (they run concurrently).
- **Never let two agents write to the same files.** Partition by directory/module. Read-only agents can overlap freely.
- Fan out breadth-first: recon agents in parallel → synthesize → implementation agents in parallel → one verification pass by YOU (the orchestrator verifies; never trust "done" reports blindly — run the build/tests yourself).
- Cap at ~4–5 concurrent for implementation work; more than that and merge conflicts + your synthesis burden outgrow the speedup. Research fan-out can go wider.

## Orchestrator discipline

- You own the plan and the final state. Subagents own subtasks. Keep a running scoreboard: dispatched / returned / verified / integrated.
- After each wave: verify (build + tests), integrate, THEN dispatch the next wave. No pipelining unverified work.
- A failed subagent gets ONE retry with an improved prompt (include what went wrong). Second failure → do it yourself or re-plan; don't loop agents on a broken spec.
- Persist state to files for anything multi-session: a `PLAN.md` with checkboxes beats context memory. Agents can read it; you can resume from it.

## Model tiering

The orchestrator's session should run the strongest model available (Opus-class) — it owns partitioning, synthesis, and severity judgment. Worker agents doing breadth (search, mapping, lane audits) should be Sonnet (`model: sonnet` in agent frontmatter — this kit's auditors and scout are). Escalate individual agents to Opus only for judgment-heavy subtasks.

## Beyond ~5 agents: Workflows

For fleets (parallel audits, per-module mapping, mass migrations), use Claude Code Workflows where your installed version supports them; otherwise use parallel Task/subagent calls with the same phase design. See the workflow-orchestration skill; `/audit-swarm` is the worked example.

## Custom agents (.claude/agents/)

This kit ships eight (see agents/ folder): `code-reviewer`, `bug-hunter`, `test-writer`, `repo-scout`, and four swarm auditors (`security-auditor`, `architecture-auditor`, `scalability-auditor`, `quality-auditor`). Prefer them over generic Task calls for their specialties — their system prompts encode the discipline, and restricted tools keep them safe (reviewer can't edit).
