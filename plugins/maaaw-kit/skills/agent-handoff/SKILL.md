---
name: agent-handoff
description: Hand work off to a different agent CLI (Codex, Gemini, Cursor, opencode) — or receive work from one — with rules, verification commands, and project memory intact. Use when the user says "hand off to codex/gemini", "continue in another agent", wants a second agent's attempt at the current task, or is setting up a repo for multiple coding agents.
---

# Agent handoff — no context left behind

A handoff fails when the receiving agent re-derives (or contradicts) what the
sending agent already settled. The engine makes the transfer mechanical:
rules, verified commands, and relevant memory travel as data.

## Sending (Claude → another agent)

1. **Sync the rules**: `maaaw rules sync` — AGENTS.md / GEMINI.md /
   `.cursor/rules/` etc. get the current canonical rules, verified commands,
   promoted memory, and the budgeted digest (rules-sync skill has details).
2. **Write the handoff**:
   `maaaw handoff write --goal "<goal>" --status "<state + precise next action>" --decisions "a;b" --next "x;y" --verification "<oracle>" --to <agent>`
   — the engine attaches the top path-relevant memory record ids and mirrors
   everything to `.agent/handoff/handoff.json`.
3. **Launch the other agent** from the repo root; its first instruction is:
   "read AGENTS.md, then `.agent/handoff/HANDOFF.md`, then verify the claimed
   state before building on it."
4. For a *bounded* task while your session stays active, use the agent-bridge
   skill (`/bridge`) instead of a full handoff.

## Receiving (any agent → this session)

1. The SessionStart hook already surfaced the handoff if one exists. Read it.
2. **Verify the claimed state** — run the verification command; do not trust
   "done" claims from any agent, including past-you.
3. Honor "Decisions made" — do not re-litigate them silently. If a decision
   looks wrong, raise it explicitly with the user.
4. Recall attached memory as needed: `maaaw memory recall "<topic>"`.

## Rules
- One handoff file, always current — overwrite, don't append history.
- Status must contain the *precise* next action (file:line), not "continue".
- Anything below a page is a summary, not a handoff; anything above two pages
  is a memoir. Aim for one.
- Vendor transcript/session transfer is a non-goal — the handoff carries
  state, not conversation.
