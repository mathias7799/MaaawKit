---
name: agent-handoff
description: Hand work off to a different agent CLI (Codex, Gemini, Cursor, opencode) — or receive work from one — with rules, verification commands, project memory, and selected prompt contract intact. Use when user says "hand off to codex/gemini", "continue in another agent", wants another agent's attempt at the current task, or is setting up a repo for multiple coding agents.
---

# Agent Handoff

Handoff fails when the receiving agent re-derives or contradicts settled state.
The engine makes transfer mechanical: rules, verified commands, memory, and
prompt provenance travel as data.

## Sending to another agent

1. Sync rules: `maaaw rules sync`.
2. Select a prompt asset when the receiving agent should adopt a specific role
   or workflow. Use `prompt_catalog` / `maaaw://prompts/catalog` in MCP.
3. Write handoff:
   `maaaw handoff write --goal "<goal>" --status "<state + precise next action>" --decisions "a;b" --next "x;y" --verification "<oracle>" --to <agent>`.
   MCP callers should pass `promptAssetId` when selected.
4. Launch the other agent in repo root. First instruction: read `AGENTS.md`,
   then `.agent/handoff/HANDOFF.md`, then verify claimed state.

For bounded work while this session stays active, use the `agent-bridge` skill
instead of full handoff.

## Receiving from another agent

1. Read `.agent/handoff/HANDOFF.md` and `.agent/handoff/handoff.json`.
2. Check `promptAssetId` / `promptAssetPath`. If the handoff selected a role or
   workflow prompt, use that as the active contract unless the user overrides it.
3. Verify claimed state by running the verification command.
4. Honor Decisions made. Do not re-litigate silently.
5. Continue from the precise next action, not from the whole transcript.

## Rules

- One handoff file, always current. Overwrite; do not append history.
- Status must contain a precise next action, ideally file:line or exact command.
- Aim for one page; anything longer is usually a memoir, not a handoff.
- Vendor transcript/session transfer is a non-goal. Handoff carries state, not
  conversation.
- Switch prompt assets deliberately. A handoff with a new `promptAssetId` is an
  explicit role/workflow change for the next agent.
