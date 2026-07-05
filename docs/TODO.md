# TODO

## Content and code quality

- [x] Run a repo-wide code similarity search across source, tests, plugin prompt
  content, and docs.
- [x] Reduce repeated MCP JSON response helpers and guard input normalization.
- [x] Centralize changed-file discovery behind `gitChangedFiles`.
- [x] Reduce repeated agent findings-contract boilerplate and align
  `audit-swarm` casing on `notCovered`.
- [x] Clarify standard audit lane ownership versus optional extra lanes.

## Follow-up candidates

- Extract shared test helpers for temp-directory cleanup and fake bridge adapter
  setup if tests churn further.
- Consider a generated fixture/validator that checks agent FindingsReport
  examples against `schemas/findings-report.schema.json`.
- Consider a small JSON parse helper only if malformed-json behavior changes in
  multiple runtime paths at once; hook paths currently need deliberately quiet
  fallback behavior.
