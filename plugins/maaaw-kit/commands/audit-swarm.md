---
description: Parallel multi-agent repo audit - security, architecture, scalability, quality/correctness specialists fan out concurrently, results synthesized into AUDIT.md
argument-hint: '[path or blank for repo root] [extra lanes, e.g. "accessibility, licensing"]'
---
Read orchestration skill `references/audit-swarm-spec.md`, then run an audit
swarm on: $ARGUMENTS

Blank path means the current repo. The standard audit uses four lanes:
security, architecture, scalability, and quality/correctness. Accessibility and
licensing are extra lanes only when I name them.

1. RECON: dispatch `repo-scout` for inventory: stacks, commands, module map.
2. FAN OUT the four specialist auditors in parallel:
   `security-auditor`, `architecture-auditor`, `scalability-auditor`,
   `quality-auditor`.
3. Give every specialist the spec's per-finding schema and read-only
   instructions. Add any extra lanes I named as additional prompted agents.
4. SYNTHESIZE per the spec: dedupe cross-lane findings, re-rank globally, keep
   every lane's `notCovered` list, and write `AUDIT.md` in the `codebase-audit`
   skill's report format.
5. VERIFY: spot-check the top 3 findings against real code before presenting.

Give me the verdict and top 5 actions inline.
