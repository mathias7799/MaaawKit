# ADR-0003: zero-dependency hook shims with generated fallback

**Accepted, 3.0.** The four hook shims are plain .mjs with no imports beyond
node builtins. Each tries `import("maaawkit/hooks")` for full engine behavior
and otherwise falls back to logic *generated at build time from the same rule
table as the engine* (drift is a CI failure, not a promise).

Why: the plugin must work with zero installs; hooks run on every tool call,
so the no-engine path must stay under ~80 ms; and a fallback that could drift
from the engine would be a security bug factory.
