# Audit Swarm Specification

Reference design for a parallel repo audit. Reuse this shape for other swarms:
phases first, lane ownership second, synthesis last.

## Standard Lanes

- `security-auditor`: secrets, injection, authn/authz, unsafe inputs, leak paths,
  vulnerable dependencies, and EOL runtimes.
- `architecture-auditor`: module boundaries, dependency direction, coupling,
  hotspots, consistency, config, and composition.
- `scalability-auditor`: performance and scale risks: N+1, sync-over-async,
  unbounded work, missing pagination/caching/timeouts, resource leaks, and
  horizontal-scaling blockers.
- `quality-auditor`: build/test/lint/type health, critical-path test coverage,
  correctness/robustness risks surfaced by tests or error handling, dependency
  hygiene signals not already owned by security, dead code, duplication, and
  operability signals such as CI reliability and generated artifacts.

Accessibility, licensing, compliance, UX, or domain-specific correctness are
extra lanes unless the user asks for them.

## Phases

1. RECON: one `repo-scout` maps stacks, entry points, size, build/test commands,
   and module boundaries. This output feeds every specialist prompt.
2. SPECIALISTS: run the four standard lanes in parallel. Each receives the recon
   summary, lane ownership, and findings contract. Instruct each specialist:
   "evidence every finding with file:line; stay in your lane; list not-covered
   areas honestly."
3. SYNTHESIS: orchestrator merges findings, dedupes cross-lane overlaps, ranks
   severity globally, and writes the final audit using the `codebase-audit`
   report shape.
4. VERIFY: orchestrator spot-checks the top findings before publishing. Swarm
   agents can hallucinate line numbers; verify the high-impact claims.

## Findings Contract

Every specialist ends with exactly one fenced `json` block containing a
FindingsReport matching `schemas/findings-report.schema.json`. Required
top-level keys are `agent`, `scope`, and `findings`; use `notCovered` for
skipped areas.

Minimum shape:

```json
{
  "agent": "<agent name>",
  "scope": "<what was examined>",
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "title": "<short title>",
      "evidence": "<specific evidence>",
      "confidence": "low|medium|high"
    }
  ],
  "notCovered": ["..."]
}
```

Optional finding keys: `file`, `line`, `recommendation`, `lane`.

## Synthesis Rules

- Cap the merged report at about 25 findings.
- Group repeated instances and carry counts instead of listing every copy.
- A finding reported by 2+ lanes gets severity-bump consideration, not duplicate
  entries.
- Preserve each lane's `notCovered` list verbatim. Audit honesty depends on it.
- Include each lane's verdict line so disagreements remain visible.

## Scaling Up

For monorepos, insert phase 1.5: fan `repo-scout` out per major module. Then run
the standard lanes per module, giving each specialist the module map and
lane-specific priority. Use prompt assets for specialist roles instead of
hand-written prompts when available.
