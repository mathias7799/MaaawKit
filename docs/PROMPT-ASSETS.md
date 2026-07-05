# Prompt assets and orchestration

MaaawKit treats bundled commands, agents, skills, and skill references as
interchangeable prompt assets. An orchestrator can inspect the catalog, select
an asset by id, and pass that id through MCP/bridge/handoff so the receiving
model knows which role, workflow, or reference contract shaped the task.

## Asset ids

Asset ids are stable and derived from plugin, kind, and name:

```text
maaaw-kit.agent.code-reviewer
maaaw-kit.skill.codebase-audit
maaaw-bridge.skill.agent-bridge
maaaw-kit.command.audit
```

Use `prompt_catalog` to list ids and `prompt_read` to inspect full text. The
same catalog is available as `maaaw://prompts/catalog`.

## Orchestrator flow

1. Pick a prompt asset based on task kind, language, and risk.
2. Read the asset when the exact contract matters.
3. Pass the id as `promptAssetId` to `bridge_run` or `handoff_write`.
4. The worker prompt or handoff records `promptAssetId` and `promptAssetPath`
   for provenance.
5. If a receiving model should switch roles, write a new handoff with the new
   prompt asset id rather than burying the change in prose.

## External reference set

Use these as source material when updating language-specific assets:

- `dotnet/skills`: official .NET skill/plugin patterns, including C# MCP
  server creation/testing, NuGet CPM conversion, template-engine workflows, and
  references.
- Microsoft C# conventions: modern C# style, analyzers, async, exception, and
  resource-handling guidance.
- TypeScript TSConfig reference: `strict`, `strictNullChecks`, `noImplicitAny`,
  and related strict-family checks.
- Microsoft PowerShell guidance: approved verbs, verb-noun command naming, and
  exception handling.

