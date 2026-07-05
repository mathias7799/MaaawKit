# Contributing to MaaawKit

MaaawKit 3.0 is one TypeScript engine (`src/`, published as `maaawkit`) plus
two content plugins (`plugins/maaaw-kit`, `plugins/maaaw-bridge`).

## Setup and checks

```bash
npm ci
npm run lint          # biome
npm run typecheck     # tsc strict
npm run build         # tsup → dist/ (needed by shim engine-path tests)
npm test              # vitest (238+ tests)
node dist/cli/main.js validate --max-skill-lines 80
node dist/cli/main.js doctor --hooks
```

All of the above must pass; CI runs them on 3 OSes × Node 20/22.

## Where things live

- **Guard rules** are data in `src/hooks/guard-rules.ts`. After changing them
  run `npm run shims` — the zero-dep hook shims embed a generated fallback and
  a drift test fails if you forget. Add porting-spec cases to `tests/guard.test.ts`.
- **Schemas** are zod models in `src/schemas/index.ts`; run `npm run schemas`
  to regenerate the committed `schemas/*.schema.json` (drift-gated in tests).
- **Skills** follow the Agent Skills spec: `plugins/*/skills/<name>/SKILL.md`,
  name == directory, WHAT+WHEN description, body ≤80 non-empty lines with
  procedures in `references/` (≤250 lines each).
- **Agents** must keep their `disallowedTools`/`maxTurns` posture and end with
  the findings contract (validated).
- **Dependencies**: no new runtime dependency without a justification row in
  the roadmap table; lockfile committed; `npm audit --omit=dev` gates CI.

## Releases

Bump the version in `package.json`, both `plugins/*/.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json`, and `src/version.ts`; add a dated CHANGELOG
entry; tag `vX.Y.Z`. The release workflow verifies tag==version and publishes
with npm provenance (prereleases go to a non-latest dist-tag).

## Security

Read SECURITY.md first. Anything that executes repo-local config must respect
the trust gates (git-tracked loop files / adapters.json are refused). Report
vulnerabilities privately.
