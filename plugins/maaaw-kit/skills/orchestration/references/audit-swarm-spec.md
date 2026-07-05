# Audit Swarm Specification

Reference design for a parallel repo audit. Reuse this shape for other swarms:
phases first, schemas second, synthesis last.

## Phases

1. RECON: one `repo-scout` maps stacks, entry points, size, build/test commands,
   and module boundaries. This output feeds every specialist prompt.
2. SPECIALISTS: run `security-auditor`, `architecture-auditor`,
   `scalability-auditor`, and `quality-auditor` in parallel. Each receives the
   recon summary, its lane, and the findings contract. Instruct each specialist:
   "evidence every finding with file:line; stay in your lane."
3. SYNTHESIS: orchestrator merges findings, dedupes cross-lane overlaps, ranks
   severity globally, and writes the final audit using the `codebase-audit`
   report shape.
4. VERIFY: orchestrator spot-checks the top findings before publishing. Swarm
   agents can hallucinate line numbers; verify the high-impact claims.

## Findings Contract

All specialists end with a fenced json block matching
`schemas/findings-report.schema.json`:

```json
{
  "agent": "<agent name>",
  "scope": "<what was examined>",
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "title": "<short title>",
      "file": "<optional file>",
      "line": 0,
      "evidence": "<specific evidence>",
      "recommendation": "<optional fix direction>",
      "confidence": "low|medium|high",
      "lane": "<optional lane>"
    }
  ],
  "notCovered": ["..."]
}
```

## Synthesis Rules

- Cap the merged report at about 25 findings.
- Group repeated instances and carry counts instead of listing every copy.
- A finding reported by 2+ lanes gets severity-bump consideration, not duplicate
  entries.
- Preserve each lane's `notCovered` list verbatim. Audit honesty depends on it.
- Include each lane's verdict line so disagreements remain visible.

## Scaling Up

For monorepos, insert phase 1.5: fan `repo-scout` out per major module. Then run
the four specialists per module, giving each the module map and lane-specific
priority. Use prompt assets for the specialist roles instead of hand-written
prompts when available.
