---
description: Parallel multi-agent repo audit — security, architecture, scalability, quality specialists fan out concurrently, results synthesized into AUDIT.md
argument-hint: '[path or blank for repo root] [extra lanes, e.g. "accessibility, licensing"]'
---
Read the workflow-orchestration skill and its references/audit-swarm-spec.md, then run the audit swarm on: $ARGUMENTS (blank = current repo, standard 4 lanes).

1. RECON: dispatch repo-scout for the inventory (stacks, commands, module map).
2. FAN OUT the four specialist auditors (security-auditor, architecture-auditor, scalability-auditor, quality-auditor) in parallel — via Claude Code Workflows with the spec's per-finding schema and read-only instructions if this Claude Code version supports Workflows; otherwise via parallel Task calls in one message with the schema enforced by prompt. Add any extra lanes I named as additional prompted agents.
3. SYNTHESIZE per the spec: dedupe cross-lane findings, re-rank globally, keep every lane's not_covered list, write AUDIT.md in the codebase-audit skill's report format.
4. VERIFY: spot-check the top 3 findings against real code before presenting. Then give me the verdict + top-5 actions inline.
