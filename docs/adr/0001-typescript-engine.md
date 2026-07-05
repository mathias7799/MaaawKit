# ADR-0001: TypeScript/Node engine (rejected: Python)

**Accepted, 3.0.** The 2.6 scripts were Python. 3.0 ports everything to a
single Node ≥20 ESM TypeScript-strict engine.

Why: Node is the only runtime guaranteed wherever the kit runs (Claude Code
requires it; Codex/Gemini/Copilot/opencode CLIs are Node); the MCP TypeScript
SDK is the first-class one; and with zero tests in 2.6 there was nothing to
preserve — the Python scripts became porting specs, and their latent bugs
(five invalid YAML frontmatter blocks the regex validator missed, among
others) were fixed in transit rather than pinned.

Rejected alternative: keep/extend Python. Would have meant two runtimes
forever and a second-class MCP story.
