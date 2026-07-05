---
name: cross-model-prompting
description: Write prompts that work when delegating to a different model family or agent runtime via bridge/handoff. Use whenever composing bridge tasks, worker prompts, AGENTS.md-style guidance, or instructions another model will consume.
---
# Cross-Model Prompting

Prompts tuned for one model often rely on invisible conventions. When another
model family or CLI reads the prompt, the usual breakpoints are implicit context,
tool assumptions, and calibration.

## What Transfers Well

- Explicit constraints: "do not modify tests", "max 40 lines", "read-only".
- Verification commands with expected evidence.
- Structured output contracts: section headers, json schemas, exact report shape.
- File paths and `file:line` evidence requirements.
- Selected prompt assets, when passed by id and included with the task.

## What Breaks Silently

- Tool-specific references: "use Task", "check memory", "run /loop". Name the
  desired outcome unless the target runtime definitely has that tool.
- Session-only context. The worker did not see the main conversation; restate the
  minimum project and task context.
- Skill vocabulary. Translate kit words into plain instructions when handing off
  to runtimes that may not know MaaawKit.
- Calibration differences. Some models act too broadly; tighten scope and
  non-goals. Some over-explain; cap report length and demand evidence-first
  bullets.

## Prompt Shape

Every cross-model prompt should contain:

1. Context: repo path, project shape, relevant files, constraints.
2. Task: precise scope and explicit non-goals.
3. Prompt asset: selected asset id/path when the worker should follow a bundled
   contract.
4. Verification: commands or checks that prove success.
5. Output: exact report format and maximum length.
6. Assumptions: tell the worker where to list uncertainty instead of guessing.

If the prompt is under five lines, it is probably under-specified.

## Practical Rules

- Prefer prompt assets over reconstructed specialist prompts when a matching
  asset exists.
- Do not encode insults or vibes. Encode constraints, evidence, and acceptance
  checks.
- Review the output contract, not the model's tone. Missing required sections
  mean the prompt failed and should be tightened.
- For bridge jobs, pass prompt assets with `--prompt-asset <asset-id>` or MCP
  `promptAssetId`. For handoffs, record `promptAssetId` so the receiver knows the
  intended contract.
