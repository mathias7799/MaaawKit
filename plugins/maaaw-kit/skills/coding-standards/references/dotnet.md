# .NET / C# Standards

Target: .NET 8+ LTS unless the repo says otherwise. Check `global.json` and `.csproj` `<TargetFramework>` first.

## Language & style
- Nullable reference types ON (`<Nullable>enable</Nullable>`). Never suppress with `!` unless you can prove non-null in a comment on the same line.
- `TreatWarningsAsErrors=true` in Directory.Build.props for new projects.
- File-scoped namespaces, primary constructors where natural, `var` when the type is obvious from the right side.
- Records for immutable data/DTOs; classes for entities with identity/behavior.
- `sealed` by default on classes not designed for inheritance.
- Pattern matching over type-checking chains; switch expressions over long if/else.
- `ConfigureAwait(false)` in library code; not needed in ASP.NET Core app code.
- Prefer `IReadOnlyList<T>`/`IEnumerable<T>` in signatures; return concrete types internally.

## ASP.NET Core
- Minimal APIs for small services, controllers for large ones — follow the repo.
- Options pattern (`IOptions<T>` + validated with `ValidateDataAnnotations().ValidateOnStart()`) for config. Never `IConfiguration["key"]` scattered through code.
- DI lifetimes: default Scoped for anything touching DbContext; Singleton only for stateless services; never inject Scoped into Singleton.
- `ProblemDetails` for error responses; global exception handler middleware, not try/catch in every endpoint.
- Cancellation tokens flow from the request through every async call.

## EF Core
- `AsNoTracking()` on read-only queries.
- No lazy loading; explicit `Include` or projection with `Select` (projections preferred for read paths).
- Migrations reviewed before applying — read the generated migration; watch for accidental drops.
- Never build SQL with string interpolation; use LINQ or `FromSql` with parameters.

## Testing (xUnit)
- Naming: `Method_Scenario_ExpectedOutcome` or Given/When/Then — match the repo.
- One assert-concept per test; use FluentAssertions if the repo already has it, don't add it otherwise.
- `WebApplicationFactory<Program>` for integration tests; Testcontainers for real DB tests.
- No `Thread.Sleep` in tests, ever. Poll with timeout or use TaskCompletionSource.

## Commands (run these, don't guess)
```bash
dotnet build -warnaserror
dotnet test --no-build
dotnet format --verify-no-changes   # or: dotnet format (to fix)
```
