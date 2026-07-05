# PowerShell Standards

Target PowerShell 7+ (`pwsh`). If a script must run in Windows PowerShell 5.1,
state that explicitly and avoid PowerShell 7 syntax such as `?.`, ternary
operators, `ForEach-Object -Parallel`, and newer native-command behavior.

Reference baseline: Microsoft approved verbs, about_Functions_Advanced,
about_Requires, about_Preference_Variables, about_StrictMode, and
PSScriptAnalyzer rules.

## Script Skeleton

Use this shape for non-trivial scripts:

```powershell
#Requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion -ge [version]'7.4') {
    $PSNativeCommandUseErrorActionPreference = $true
}
```

- Use `[CmdletBinding()]` for script-style commands so callers get common
  parameters such as `-Verbose`, `-Debug`, and `-ErrorAction`.
- Use `SupportsShouldProcess` and `$PSCmdlet.ShouldProcess()` for destructive or
  externally visible mutations: delete, overwrite, stop, deploy, publish.
- Put `Set-StrictMode -Version Latest` and `$ErrorActionPreference = 'Stop'`
  near the top after `param`.

## Naming And Shape

- Use approved `Verb-Noun` names. Check with `Get-Verb`; nouns should usually be
  singular.
- Prefer advanced functions for reusable commands. Keep scripts as thin
  orchestration when logic grows.
- Write full parameter names in scripts (`-Recurse`, not `-r`). Aliases are for
  interactive shells, not committed code.
- Use explicit parameter validation: `[ValidateNotNullOrEmpty()]`,
  `[ValidateSet()]`, `[ValidatePattern()]`, and typed parameters.
- Keep pipeline behavior deliberate. Use `begin`, `process`, and `end` blocks
  when accepting pipeline input.

## Output And Logging

- Emit objects, not formatted strings. Use `[pscustomobject]@{ ... }` for
  structured output and let callers format.
- Use `Write-Verbose` for diagnostics, `Write-Warning` for recoverable warnings,
  and `Write-Error` or terminating exceptions for failures.
- Avoid `Write-Host` except for intentional human-facing UI text that must bypass
  the pipeline.
- Do not parse formatted command output when an object or structured format is
  available.

## Error Handling

- Do not swallow exceptions. Catch only to add useful context, clean up, or
  translate an external failure.
- Prefer terminating errors for failures that should stop the command:
  `throw`, `$PSCmdlet.ThrowTerminatingError(...)`, or cmdlets with
  `-ErrorAction Stop`.
- Native commands still need attention. In PowerShell 7.4+, enable
  `$PSNativeCommandUseErrorActionPreference = $true`; otherwise check
  `$LASTEXITCODE` after native commands whose exit status matters.
- Include the relevant input in error messages without leaking secrets.

## Correctness Pitfalls

- Put `$null` on the left side of comparisons: `$null -eq $Value`.
- PowerShell comparisons are case-insensitive by default. Use `-ceq`, `-cne`,
  `-cmatch`, etc. when case matters.
- Avoid `+=` on arrays in loops. Stream output, assign from a loop, or use
  `System.Collections.Generic.List[T]` when mutation is necessary.
- Use `Join-Path` or `[System.IO.Path]` APIs for paths; do not concatenate path
  strings.
- Quote paths and arguments. Treat user-provided input to native commands as
  data, not as command text; avoid `Invoke-Expression`.

## Testing And Linting

- Use Pester 5. Match the repo's existing `Describe`/`Context`/`It` style.
- Mock only external boundaries: filesystem, network, clock, process execution,
  registry, services.
- Run PSScriptAnalyzer and fix warnings rather than suppressing them:

```powershell
Invoke-ScriptAnalyzer -Path . -Recurse -Severity Warning,Error
Invoke-Pester
```

## Cross-Platform

- Prefer `pwsh` and platform-neutral cmdlets.
- Do not assume path separators, drive letters, execution policy, or case
  sensitivity.
- When invoking native tools, verify they exist with `Get-Command` and provide a
  clear error if missing.
