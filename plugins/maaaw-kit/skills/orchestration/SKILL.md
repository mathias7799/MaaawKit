---
name: orchestration
description: Decompose work and delegate to subagents, bridge workers, and fleets effectively. Use for large multi-part tasks, parallel research, codebase-wide analysis, swarm audits, independent workstreams, or when the user mentions agents, subagents, parallelization, workflows, swarms, or in-parallel execution.
---

# Orchestration & Subagents

Subagents and bridge workers have their own context. The point is to protect the
main context, parallelize independent work, and get back compact reports instead
of raw exploration.

## When to delegate

Delegate when:

- Search or analysis would burn the main context.
- Workstreams are independent and can run in parallel.
- Isolation is useful: experiments, second reviews, or blind review passes.
- A bundled prompt asset already matches the role better than an ad hoc prompt.

Do it yourself when:

- The task depends heavily on conversation context.
- Steps are sequential and depend on the previous edit.
- The task is small enough that briefing would cost more than doing.

## Writing worker prompts

Every delegated prompt must be self-contained:

1. Context: repo path, project shape, constraints.
2. Task: precise scope and explicit non-goals.
3. Verification: command or evidence proving success.
4. Report format: exact shape and maximum length.

If the prompt is under five lines, it is probably under-specified.

## Prompt asset routing

Prompt assets are interchangeable role/workflow/reference contracts. Use them
instead of rewriting specialist prompts from memory.

- Discover assets with `prompt_catalog` or `maaaw://prompts/catalog`.
- Read exact text with `prompt_read <id>` when the contract matters.
- For bridge jobs, pass `--prompt-asset <id>` or MCP `promptAssetId`.
- For handoffs, record `promptAssetId` so the receiving model knows the active
  contract.
- Switch assets deliberately between waves. Example: `repo-scout` for recon,
  `architecture-auditor` for structure, then `test-writer` for regression tests.

If a selected asset conflicts with the explicit task, the explicit task wins and
the conflict must be reported under Assumptions.

## Parallelization rules

- Independent tasks: launch in one message so they run concurrently.
- Never let two writers own the same files. Partition by module/path.
- Read-only agents may overlap.
- Fan out breadth-first: recon → synthesize → implementation → verification by
  the orchestrator.
- Cap implementation concurrency around 4-5. Research fan-out can go wider.

## Orchestrator discipline

- You own final state. Delegates own subtasks.
- Track dispatched / returned / verified / integrated.
- After each wave, verify, integrate, then dispatch the next wave.
- A failed delegate gets one retry with a sharper prompt. A second failure means
  re-plan or do it yourself.
- Persist state for multi-session work in `PLAN.md` or `.agent/handoff/`.

## Model tiering

The orchestrator should use the strongest available model: it owns partitioning,
synthesis, severity judgment, and final integration. Breadth workers can use
cheaper/faster models when the task is search, mapping, or lane auditing.

## Fleets

For more than about five agents, run phases instead of a soup of workers:

- Recon.
- Parallel specialists.
- Synthesis.
- Optional parallel fixes.
- Verification.

Schema every agent report. Free-text reports from many agents do not compose.
For audit swarms, read `references/audit-swarm-spec.md`.

## Bundled agents

This kit ships eight agents:

- `repo-scout`
- `code-reviewer`
- `bug-hunter`
- `test-writer`
- `security-auditor`
- `architecture-auditor`
- `scalability-auditor`
- `quality-auditor`

Prefer these assets over generic delegation when their specialty matches the
task. Their prompts encode discipline and tool restrictions.
