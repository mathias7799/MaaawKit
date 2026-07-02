---
name: workflow-orchestration
description: Run large parallel jobs using Claude Code Workflows where available, or parallel Task/subagent fallbacks otherwise — fan out agents with structured outputs, isolation discipline, and a synthesis phase. Use for swarm audits, repo-wide analysis, multi-module implementation, or whenever the user says "workflow", "swarm", "in parallel with many agents", or a task exceeds what 3–5 Task-tool subagents can cover. For small fan-outs, the plain orchestration skill suffices.
---

# Workflow Orchestration

Where your Claude Code version provides Workflows, use them for background fleet execution, progress tracking, structured outputs, and worktree isolation. Where it does not, run the same phase design through parallel Task/subagent calls. This skill is about using fleets *well* — the failure mode of 50 agents is 50 rambling reports nobody can synthesize.

## Design rules for any workflow

1. **Phases, not soup.** Structure every workflow as: recon → parallel specialists → synthesis (→ optional parallel fixes → verification). Later phases consume earlier outputs; never pipeline unverified work.
2. **Schema every agent.** Free-text reports from N agents don't compose. Give each agent a structured-output schema (see `references/audit-swarm-spec.md` for ready-made ones) so synthesis is mechanical merging + judgment, not re-reading essays. Keep schemas flat and small — deep nesting causes validation-retry loops (the runtime aborts after ~5 schema failures).
3. **Self-contained prompts.** Workflow agents inherit nothing from your conversation. Each prompt: context paragraph, bounded task with non-goals, evidence requirements (file:line), and the schema's field meanings. Under 5 lines of prompt = junk results at fleet scale.
4. **Read-only by default; worktrees for writers.** Analysis agents get read-only instructions. Any agent that edits files gets `isolation: "worktree"` — two agents writing one tree is how swarms corrupt repos. Merging worktree results is the orchestrator's job, after verification.
5. **Right-size the fleet.** Partition by real boundaries (module, directory, concern) — not "one agent per file". 4–8 specialists beat 40 generalists for audits; wide fleets (20+) are for embarrassingly parallel work (per-module mapping, mass migration checks).
6. **Deterministic scripts.** Workflow scripts must be deterministic (the validator rejects e.g. `Date.now()`/`Math.random()` in logic). Put variability in agent prompts, not script control flow.
7. **The orchestrator verifies.** After synthesis, YOU run the build/tests/spot-checks. Fleet agents report; they don't get trusted.

## How to launch

- **If Workflows is available in your installed version:** ask for one in natural language ("run a workflow: …"), describing phases, per-agent schemas, isolation needs, and the synthesis output; monitor via `/workflows`. Saved workflows in `.claude/workflows/` are reusable; nearest `.claude/` wins on collisions. Verify availability rather than assuming it — the feature has evolved across versions.
- **Otherwise (first-class path, not a degraded one):** run the identical phase design through parallel Task-tool subagents launched in a single message, ~5 concurrent max, schemas enforced by prompt ("respond ONLY with JSON matching: …"). Everything in this skill except the runtime applies unchanged.
- **In Codex:** none of these primitives exist — use skills, the task brief, configured subagents, and explicit verification loops to perform the same staged process manually.

## Model economics

Run the orchestrating session on the strongest model available (Opus-class — it owns judgment: partitioning, synthesis, severity calls). Specialist agents declare `model: sonnet` in their frontmatter (this kit's auditors do) — breadth work is Sonnet-shaped, and a 6-agent Opus fleet costs real money for little gain on evidence-gathering. Escalate a single agent to Opus only when its subtask is judgment-heavy (e.g. the synthesis agent in a very large workflow).

## Worked example

The `/audit-swarm` command is the reference implementation: 4 specialist auditors (security, architecture, scalability, quality — this kit ships them as agents with schemas) + repo-scout recon, synthesized into one prioritized AUDIT.md. Read `references/audit-swarm-spec.md` before building similar swarms.
