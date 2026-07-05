# MaaawKit Content Audit - July 2026

Scope: current plugin agents, skills, references, prompt assets, and MCP prompt
surface. This note records the next-phase cleanup decisions without changing the
published inventory counts.

## Inventory

- Agents: 8 in `plugins/maaaw-kit/agents`.
- MaaawKit skills: 11 in `plugins/maaaw-kit/skills`.
- Bridge skills: 5 in `plugins/maaaw-bridge/skills`.
- Language references: .NET/C#, PowerShell, TypeScript, Python under
  `coding-standards/references`.
- Orchestration reference: `orchestration/references/audit-swarm-spec.md`.

## Decisions

- Keep the eight agents. They map to distinct orchestration roles:
  reconnaissance, review, diagnosis, tests, security, architecture, scalability,
  and quality. No merge is useful yet because each role has different evidence
  expectations and tool permissions.
- Keep `coding-standards` as one skill with per-language references. Splitting
  .NET, TypeScript, PowerShell, and Python into separate skills would increase
  trigger noise without improving behavior.
- Keep bridge skills separate. `agent-bridge`, `agent-handoff`,
  `cross-model-prompting`, `cross-review`, and `rules-sync` represent different
  workflows and should stay independently triggerable.
- Use prompt assets for role contracts during orchestration. The orchestrator can
  select assets from `prompt_catalog`, read them with `prompt_read`, and pass the
  selected `promptAssetId` through bridge jobs or handoffs.
- Keep MCP prompts/resources/tools as the interchange layer instead of inventing
  another prompt registry.

## Adapted In This Pass

- Refreshed .NET/C# standards with `dotnet/skills` patterns for C# MCP servers,
  Central Package Management, and protocol-level testing.
- Refreshed TypeScript standards around strict TSConfig behavior, I/O boundary
  validation, React effects, and Next.js server/client boundaries.
- Rebuilt PowerShell standards around approved verbs, advanced functions,
  strict mode, terminating errors, native-command behavior, PSScriptAnalyzer,
  and Pester.
- Normalized `repo-scout`, `security-auditor`, and `scalability-auditor` prompts
  that had become too compressed to read cleanly.
- Rewrote `audit-swarm-spec.md` around the current findings schema.
- Rewrote `cross-model-prompting` around cross-runtime prompt assets and
  handoff-friendly prompt shape.

## External References Pulled

- `dotnet/skills`: especially `mcp-csharp-create`, `mcp-csharp-test`,
  NuGet Central Package Management conversion, and template-authoring guidance.
- Microsoft C# coding conventions.
- TypeScript TSConfig reference for `strict` and related checks.
- Microsoft PowerShell docs for approved verbs, advanced functions,
  `about_StrictMode`, preference variables, and PSScriptAnalyzer.

## Missing Critical Coverage

- A dedicated .NET MCP reference skill may be worth adding later if this repo
  starts generating C# MCP servers often. For now, the .NET reference captures
  the important rules without expanding the skill count.
- A NuGet Central Package Management migration checklist could become its own
  reference if package migration work becomes common.
- Code similarity and prompt slop detection should be a separate pass because it
  needs repo-wide similarity tooling and likely shared helper extraction. Tracked
  in `docs/TODO.md`.
