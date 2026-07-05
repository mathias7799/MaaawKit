# Audit Swarm Specification

Reference design for the parallel repo audit. Reuse the shape (phases + schemas) for other swarms.

## Phases
1. RECON (1 agent, repo-scout): inventory — stacks, entry points, size, build/test commands, module map. Output feeds every specialist prompt.
2. SPECIALISTS (4 parallel): security-auditor, architecture-auditor, scalability-auditor, quality-auditor (this plugin ships all four, `model: sonnet`, read-only). Each receives: the recon summary + its lane + the schema below + "evidence file:line for every finding; do not stray into other lanes."
3. SYNTHESIS (orchestrator, or one opus agent for very large repos): merge findings, dedupe cross-lane overlaps (the same god-file will surface in 3 lanes — one finding, three lenses), re-rank severity globally, write AUDIT.md per the codebase-audit skill's report format.
4. VERIFY (orchestrator): spot-check the top 3 findings against the actual code before publishing — swarm agents occasionally hallucinate line numbers.

## Per-finding schema (all specialists share it)
```json
{
  "type": "object",
  "properties": {
    "verdict": {"type": "string", "enum": ["red", "orange", "green"]},
    "verdict_reason": {"type": "string"},
    "findings": {"type": "array", "items": {"type": "object", "properties": {
      "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
      "title": {"type": "string"},
      "location": {"type": "string", "description": "file:line, or file range"},
      "evidence": {"type": "string"},
      "impact": {"type": "string"},
      "fix": {"type": "string"},
      "effort": {"type": "string", "enum": ["S", "M", "L"]}
    }, "required": ["severity", "title", "location", "evidence", "impact", "fix"]}},
    "clean_checks": {"type": "array", "items": {"type": "string"}},
    "not_covered": {"type": "array", "items": {"type": "string"}}
  },
  "required": ["verdict", "verdict_reason", "findings", "clean_checks", "not_covered"]
}
```

## Synthesis rules
- Cap merged report at ~25 findings; group repeated instances with counts.
- A finding reported by 2+ lanes gets a severity bump consideration, not duplication.
- Preserve every lane's `not_covered` list verbatim in the final report — the audit's honesty lives there.
- Include each lane's verdict line so disagreement between lanes is visible.

## Scaling up
For monorepos: insert phase 1.5 — fan repo-scout out per module (this is where 10–30 agents is justified), then run the 4 specialists per major module or give each specialist the module map to prioritize within their lane.
