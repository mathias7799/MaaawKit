---
name: coding-standards
description: Production coding standards for .NET/C#, PowerShell, TypeScript (React/Next.js), and Python. Use this skill whenever writing, refactoring, or reviewing code in any of these languages — even for "quick scripts" or small fixes. Also use when scaffolding new projects, choosing libraries, or when the user asks for "production level" or "clean" code.
---

# Coding Standards

Before writing code, identify the language and read the matching reference file. Read ONLY the relevant one(s):

- `references/dotnet.md` — C#, ASP.NET Core, EF Core, xUnit
- `references/powershell.md` — PowerShell 7+, modules, Pester
- `references/typescript.md` — TypeScript, React, Next.js
- `references/python.md` — Python 3.11+, uv, pytest, typing

## Universal rules (all languages)

1. **Read before you write.** Never modify a file you haven't viewed. Match the existing style of the repo over these standards when they conflict — consistency beats preference.
2. **No silent failure.** Never swallow exceptions with empty catch/except blocks. Either handle meaningfully, wrap with context and rethrow, or let it propagate.
3. **Fail at the boundary.** Validate inputs at system edges (API handlers, CLI args, file parsers). Internal functions may trust their callers — don't defensive-code everything.
4. **Errors carry context.** Every error message must answer: what failed, with what input, and what the caller can do about it.
5. **Small surface area.** Prefer fewer public members. Internal/private by default. Don't build abstractions for one caller ("rule of three").
6. **No dead code.** Never leave commented-out code, unused imports, or `// TODO: remove` in a final diff.
7. **Dependencies are liabilities.** Before adding a package, check if the stdlib/framework already does it. If adding one, pin the version.
8. **Concurrency needs a reason.** Only introduce async/parallelism when there's real I/O or measured need. Never mix sync-over-async (`.Result`, `.GetAwaiter().GetResult()` in .NET) without documented justification.
9. **Secrets never in code.** Use environment variables, user-secrets, or a vault. If you see a hardcoded secret while editing, flag it to the user.
10. **Tests prove behavior, not lines.** Test the contract (inputs → outputs, error cases), not the implementation. One test per behavior, descriptive names.

## Definition of Done (before claiming a task is complete)

- Code compiles / type-checks with zero new warnings
- Linter passes (the post-edit hook enforces this; fix what it reports, don't disable rules)
- New behavior has at least one test; changed behavior has updated tests
- You actually ran the build/tests and saw them pass — never claim success from reading code
