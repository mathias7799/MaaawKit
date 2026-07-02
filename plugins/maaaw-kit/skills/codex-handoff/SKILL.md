---
name: codex-handoff
description: Hand off work from Claude Code to OpenAI Codex CLI (or keep both agents aligned on one repo). Generates AGENTS.md and a task briefing Codex can execute. Use when the user says "hand off to codex", "continue in codex", "to-codex", wants a second agent's attempt, wants AGENTS.md created/synced, or is setting up a repo for multiple coding agents.
---

# Codex Handoff

Claude Code and Codex CLI read different instruction files (CLAUDE.md vs AGENTS.md) but the underlying contract — standards, verification commands, current state — is agent-agnostic. A handoff transfers three things: **the rules** (AGENTS.md), **the state** (HANDOFF.md), and **the mission** (the briefing). Lose any one and the receiving agent starts half-blind.

## Procedure

1. **Snapshot state first.** If the task is mid-flight, run the session-handoff skill to write HANDOFF.md (with the file:line-precise IN PROGRESS action and hypotheses-already-tried). Make a WIP commit — never hand an uncommitted tree to another agent that may run destructive commands.
2. **Generate the transfer files:** run `python <plugin>/scripts/to-codex.py --goal "<goal>" [--oracle "<cmd>"]` from the repo root (add `--install-skills` to copy skills into `.agents/skills/`, `--write-config` for a lean `.codex/config.toml`, `--install-hooks` for optional Codex hooks, `--dry-run` to preview). It:
   - Creates/updates **AGENTS.md** (kept lean — Codex's project-doc budget defaults to 32KiB; temporary task context goes in the brief, never AGENTS.md): core working agreement + language rules for the detected stacks (dotnet/node/python/powershell) + verification commands + the repo-specific sections of CLAUDE.md. It only touches its own marker-delimited block, backs up first, and is idempotent — safe to re-run forever.
   - Writes **.codex/brief.md** (the short-lived task handoff): goal + oracle + the full HANDOFF.md, phrased as instructions to the receiving agent (verify claimed state, honor decisions-made).
3. **Review AGENTS.md** — you're accountable for what you hand over. Ensure the verification commands actually run in this repo (test one if unsure) and repo-specific landmines from CLAUDE.md carried over.
4. **Give the user the launch commands** (the script prints them): interactive `codex`, or non-interactive `codex exec --sandbox workspace-write` with the brief. Notes to pass on:
   - Codex reads AGENTS.md automatically (repo root; nested ones override for subdirs; `~/.codex/AGENTS.md` for global).
   - Sandbox/approval flags evolve — `codex --help` is the source of truth; config lives in `~/.codex/config.toml`.
   - `codex resume` continues its previous session.
5. **On return (Codex → Claude):** read HANDOFF.md/AGENTS.md changes and `git log` since the WIP commit; run the oracle before building on Codex's work. Same trust-but-verify as any handoff.

## What Codex does and does not get

Supported via export: AGENTS.md, .codex/brief.md, skills in .agents/skills/, optional .codex/config.toml and hooks (which require trust review via /hooks in Codex). NOT ported: Claude slash commands, plugin behavior, Claude-specific agent fields/hook events, Workflow primitives — translate intention, don't copy files blindly. Codex subagents (`[agents]` in config.toml) are the analogue of this kit's reviewer agents; conceptual templates ship in templates/codex/agents/, verify the current schema before use. Full mapping: docs/CODEX.md.

## Skills are portable to Codex

Codex supports Agent Skills as `SKILL.md` folders and discovers repo-scoped skills from `.agents/skills/`. So the higher-fidelity handoff is installing MaaawKit skills into Codex directly rather than relying on AGENTS.md prose alone. AGENTS.md remains the baseline (always read, zero setup); skills are the upgrade. Claude hook implementations can be exported for Codex, but `.codex/hooks.json` must use Codex's current event-keyed hook schema and must be reviewed/trusted with `/hooks`.

## Keeping a dual-agent repo aligned

- CLAUDE.md stays the source of truth for repo specifics; re-run to-codex.py after meaningful CLAUDE.md edits to sync the shared sections into AGENTS.md.
- Claude hooks can be exported to Codex, but Codex hook config/trust is a separate runtime concern. AGENTS.md should still state the rules the hooks normally enforce.
- Don't run both agents on the same working tree simultaneously. Separate branches or worktrees (`git worktree add ../repo-codex codex/attempt`), merge the winner.
- For live in-session delegation, prefer the `codex-worker` skill/command over ad-hoc shell commands. It writes task/result files and uses isolated worktrees for write-capable modes.

## When a Codex handoff is actually useful
- Second independent attempt at a stubborn bug (fresh eyes, different model)
- User's Claude usage limits are exhausted mid-task
- Comparing approaches on a well-oracled task (give both the same brief + oracle, diff results)
- Repo has collaborators who use Codex — AGENTS.md keeps standards enforced for them too


## In-session Codex worker delegation

When the user wants Claude to hand a bounded task to Codex while the Claude session stays active, use the `codex-worker` skill instead of a plain handoff. The safe pattern is:

1. Claude defines a narrow task and oracle.
2. MaaawKit writes `.codex/tasks/<task>.md`.
3. `codex exec` runs in read-only mode for reviews or in an isolated worktree for implementation.
4. MaaawKit captures `.codex/results/<result>.md` and, for write modes, a patch/stat.
5. Claude reviews and verifies before accepting anything.

Use handoff/export when another Codex session or collaborator will continue later. Use worker delegation when Claude wants a bounded answer or implementation attempt during the current session.
