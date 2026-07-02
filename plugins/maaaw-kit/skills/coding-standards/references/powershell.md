# PowerShell Standards

Target PowerShell 7+ (`pwsh`). If the script must run in Windows PowerShell 5.1, say so explicitly and avoid 7+ syntax (`?.`, ternary, `-Parallel`, `$ErrorActionPreference` differences).

## Script skeleton (every non-trivial script)
```powershell
#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$Path
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
```
- `Set-StrictMode -Version Latest` + `$ErrorActionPreference = 'Stop'` at the top of every script. Non-negotiable — silent continuation is the #1 PowerShell bug source.
- `[CmdletBinding()]` on every function → gets `-Verbose`, `-ErrorAction`, etc. for free.
- `SupportsShouldProcess` + `$PSCmdlet.ShouldProcess()` on anything destructive (delete, overwrite, stop-service).

## Style
- Verb-Noun with approved verbs only (`Get-Verb` to check). Singular nouns.
- Full parameter names in scripts (`-Recurse` not `-r`); aliases only interactively.
- No `Write-Host` for data — use `Write-Output` (pipeline), `Write-Verbose` (diagnostics), `Write-Warning`/`Write-Error`. `Write-Host` only for deliberate UI text.
- Output objects (`[PSCustomObject]@{...}`), never formatted strings. Formatting is the caller's job.
- Comparison operators: remember `-eq` is case-insensitive; use `-ceq` when case matters. `$null -eq $x` (null on LEFT) to avoid array coercion surprises.
- Avoid `+=` on arrays in loops (O(n²)); collect with `$results = foreach (...) {...}` or `[List[object]]`.
- `Join-Path` / `[IO.Path]::Combine` — never string-concatenate paths.

## Error handling
- try/catch around external calls; rethrow with context: `throw "Failed to process '$Path': $_"` or better, `$PSCmdlet.ThrowTerminatingError($_)`.
- Native commands (exe): check `$LASTEXITCODE` explicitly after every call, or use PS 7.4+ `$PSNativeCommandUseErrorActionPreference = $true`.

## Testing & linting
- Pester 5 for tests: `Describe/Context/It`, `BeforeAll` for setup, mock external calls with `Mock`.
- PSScriptAnalyzer must pass: `Invoke-ScriptAnalyzer -Path . -Recurse -Severity Warning,Error`.

## Cross-platform notes
- Case-sensitive paths on Linux; don't assume `C:\`; use `$env:TEMP` alternatives via `[IO.Path]::GetTempPath()`.
- `pwsh -NoProfile -File script.ps1` in automation — never rely on profile state.
