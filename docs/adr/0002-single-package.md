# ADR-0002: single npm package (rejected: pnpm workspace)

**Accepted, 3.0.** One package `maaawkit` with an exports map (`maaawkit`,
`maaawkit/hooks`, `maaawkit/mcp`) and one `maaaw` bin.

Rejected alternative: a pnpm monorepo (@maaaw/core, @maaaw/cli, @maaaw/mcp) —
correct at 5× the scale, pure overhead at this one. Revisit if the bridge
grows an independent release cadence.
