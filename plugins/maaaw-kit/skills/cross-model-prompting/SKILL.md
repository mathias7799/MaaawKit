---
name: cross-model-prompting
description: Write prompts that work when delegating to a DIFFERENT model family (Codex/GPT, Gemini, Copilot, Cursor) via the bridge or a handoff — what transfers, what silently breaks, and how to compensate. Use whenever composing a bridge task, a worker prompt, or AGENTS.md-style guidance another model will consume.
---

# Cross-model prompting — write for the stranger

Prompts tuned to one model quietly rely on its conventions. When the reader
is a different model family, three things break: implicit context, tool
assumptions, and your calibration of how much rope to give.

## What transfers 1:1
- Explicit constraints ("do NOT modify tests", "max 40 lines of report").
- Verification commands with expected exit codes — every model respects a
  runnable oracle better than prose quality bars.
- Structured output contracts (exact section headers, JSON schemas). The
  bridge's worker-prompt format exists for this reason; keep it.
- File paths and file:line evidence requirements.

## What silently breaks
- **References to YOUR tools**: "use the Task tool", "check your memory" —
  other CLIs have different or no equivalents. Name outcomes, not tools.
- **Implicit repo context**: the other model didn't see your session. Restate
  the one-paragraph context every time (the bridge prompt template does).
- **Skill/command vocabulary**: /loop, subagents, hooks are this kit's words.
  Translate to plain instructions ("run <oracle>; if it fails, fix and rerun").
- **Calibration**: models differ in eagerness. GPT/Codex-family tends to act
  fast and wide — tighten scope and add explicit non-goals. Gemini-family
  tends to over-explain — cap report length and demand evidence-first bullets.
  Never encode these as insults; encode them as constraints for everyone.

## Practical rules
1. Every cross-model prompt is self-contained: context ¶ → bounded task with
   non-goals → verification → exact output format. No exceptions.
2. Prefer the engine's primitives — `maaaw bridge run` builds a compliant
   worker prompt; `maaaw rules sync` gives every model the same ground truth.
3. One task per delegation. Multi-part asks degrade unpredictably across
   families; chain jobs instead.
4. Ask for uncertainty explicitly ("list assumptions under ## Assumptions") —
   default confidence norms differ wildly between models.
5. Review output against the contract, not against vibes: missing sections
   mean the prompt failed, not the model.
