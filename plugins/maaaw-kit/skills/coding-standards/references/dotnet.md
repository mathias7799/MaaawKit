# .NET / C# Standards

Target .NET 8+ LTS unless the repo says otherwise. Check `global.json`,
`TargetFramework`, `Directory.Build.props`, and analyzer configuration first.

Reference baseline: Microsoft C# coding conventions and `dotnet/skills`
patterns for C# MCP servers, Central Package Management, trusted publishing, and
template authoring.

## Language and style

- Nullable reference types on. Avoid `!`; when unavoidable, explain why the
  value is proven non-null.
- Treat warnings as errors in new projects unless the repo explicitly does not.
- File-scoped namespaces, primary constructors, collection expressions, and
  pattern matching are fine when the target C# version and repo style support
  them. Do not churn old code just to modernize syntax.
- Use `var` when the right side makes the type obvious; use explicit types when
  it improves readability.
- Records for immutable data/DTOs; classes for identity/behavior.
- `sealed` by default for classes not designed for inheritance.
- Prefer `IReadOnlyList<T>` / `IEnumerable<T>` at boundaries; use concrete
  collections internally when needed.
- Public library APIs need XML docs when consumed outside the repo.

## Async, errors, and resources

- No sync-over-async (`.Result`, `.Wait()`, `.GetAwaiter().GetResult()`) around
  I/O.
- Pass `CancellationToken` through long-running or request-scoped async paths.
- Use `ConfigureAwait(false)` in reusable libraries; not needed in ASP.NET Core
  application code.
- Dispose `IDisposable` / `IAsyncDisposable` with `using` / `await using`.
- Do not swallow exceptions. Add context and rethrow, translate at a boundary, or
  let the exception propagate.

## ASP.NET Core

- Minimal APIs for small services, controllers for larger APIs. Follow repo
  convention.
- Options pattern with validation (`ValidateDataAnnotations()`,
  `ValidateOnStart()`) for config. Do not scatter `IConfiguration["key"]`.
- DI lifetimes: scoped for DbContext work, singleton only for stateless services,
  never scoped into singleton.
- Use global exception handling and `ProblemDetails`, not try/catch in every
  endpoint.
- Use typed results or explicit response contracts for public endpoints.
- Log with `ILogger<T>` and structured properties; no `Console.WriteLine` in app
  code.

## EF Core

- `AsNoTracking()` for read-only queries.
- Prefer projections with `Select` for read paths; avoid lazy loading.
- Review generated migrations before applying; watch for accidental drops.
- Never build SQL with string interpolation. Use LINQ or parameterized `FromSql`.

## NuGet and build

- Prefer Central Package Management for multi-project repos. Place
  `Directory.Packages.props` at the common ancestor of in-scope projects, not
  blindly at repo root.
- Before CPM conversion: capture baseline build and package list; stop if
  `packages.config` exists.
- During CPM conversion, do not upgrade beyond the highest version already in use
  unless the user explicitly asked for package upgrades.
- Respect `Directory.Build.props` / `Directory.Build.targets`; they are repo
  policy.

## MCP servers in C#

- Official SDK package: `ModelContextProtocol`.
- Local IDE/CLI server: prefer stdio. Stdout is JSON-RPC only; all logging must
  go to stderr.
- Remote/cloud server: use ASP.NET Core HTTP transport and `MapMcp`.
- Implement tools, prompts, and resources with SDK attributes or builder APIs.
  Descriptions are model-visible contract.
- Test tool methods directly, then add protocol-level integration tests with the
  MCP client SDK.

## Testing

- Prefer xUnit unless the repo already uses NUnit or MSTest.
- Name tests by behavior and scenario, e.g. `Method_Scenario_ExpectedOutcome`.
- One behavior per test; assert outcomes and contracts, not internals.
- Use `WebApplicationFactory` for API integration tests when applicable.
- Use `ITestOutputHelper`, not `Console.WriteLine`.

## Commands

```bash
dotnet build -warnaserror
dotnet test --no-build
dotnet format --verify-no-changes
dotnet list package --vulnerable --include-transitive
```
