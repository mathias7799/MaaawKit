---
name: debugging
description: Systematic debugging methodology. Use whenever something is broken, failing, crashing, flaky, "not working", producing wrong output, or when tests fail — including build errors, runtime exceptions, CI failures, performance problems, and "it works on my machine" situations. Use BEFORE attempting fixes, not after several failed attempts.
---

# Debugging

The core discipline: **reproduce → hypothesize → instrument → verify → fix → prove**. Skipping steps is how you end up "fixing" the same bug three times.

## The rules

1. **Reproduce first.** No fix before you can trigger the failure on demand. If it's flaky, make it reliable first (loop it, fix the seed, pin the timing). A bug you can't reproduce is a bug you can't verify as fixed.
2. **Read the actual error.** The full message, the full stack trace, the innermost exception. Most bugs are solved by reading the error slowly instead of pattern-matching on the first line. For .NET: the *inner* exception. For Python: the *last* frame that's in your code. For TS: the first error, not the 40 cascading ones.
3. **One hypothesis at a time.** State it explicitly ("I believe X because Y"). Design the smallest experiment that can falsify it. Change ONE thing, observe, conclude. Never shotgun multiple changes — if it works you won't know why, and if it doesn't you've corrupted the crime scene.
4. **Bisect the search space.** Half the pipeline at a time: is the data wrong going IN or coming OUT of this stage? `git bisect` for regressions ("it worked last week" = run `git bisect`, don't stare at code). Comment out half, binary-search the failure.
5. **Instrument, don't stare.** Add targeted logging/prints of the actual values at the suspected boundary. Print types, lengths, and reprs — not just values (`repr(x)`, `x.GetType()`, `typeof x`). Whitespace, encoding, and null-vs-empty hide from plain printing.
6. **Question your assumptions before the tool's.** "The config is definitely loaded", "this function is definitely called", "the cache is definitely cleared" — verify each cheap assumption with a print before assuming the compiler/framework/library is broken. It's your code ~95% of the time.
7. **When stuck (3 failed hypotheses): stop and widen.** Re-read the error from scratch. Diff against last-known-good (`git diff`, env vars, dependency versions, `dotnet --info`/`node -v`/`python -V`). Check the environment, not just the code: PATH, working directory, file permissions, line endings (CRLF!), timezone, locale, case-sensitivity.
8. **Fix the cause, not the symptom.** If the fix is a null-check, ask why the null got there. If the fix is a retry, ask what fails. Symptom patches are allowed only when explicitly labeled as such with a comment and a follow-up noted to the user.
9. **Prove the fix.** Re-run the exact reproduction from step 1 and watch it pass. Then run the full test suite to check for collateral damage. Then — if it was worth debugging, it's worth a regression test.
10. **Clean up.** Remove every debug print/log you added. `git diff` before declaring done — the diff should contain the fix and the test, nothing else.

## Language-specific fast paths

- **.NET**: `dotnet build -warnaserror` output bottom-up; exceptions → check `InnerException` chain; async deadlocks → look for `.Result`/`.Wait()`; DI failures → read the full "Unable to resolve service" chain, it names the exact missing registration.
- **PowerShell**: `$Error[0] | Format-List * -Force` shows the real exception; `Set-StrictMode` catches typo'd variables; `-eq` case-insensitivity and `$null` array-coercion are classic false-positive sources; check `$LASTEXITCODE` after any exe.
- **TypeScript/Next.js**: distinguish build-time vs runtime vs hydration errors — hydration mismatch means server HTML ≠ client render (check `Date`, `random`, browser-only APIs, locale). `rm -rf .next` (or `node_modules`) before blaming the framework. Type errors: read the LAST line of the type diff first.
- **Python**: last frame of the traceback in YOUR code; `python -X dev` enables extra checks; mutable default args and late-binding closures in loops are the classic silent bugs; venv confusion → `which python` / `pip list` inside the same shell that fails.

## Anti-patterns (never do these)

- Changing code before reproducing the failure
- "Let me just try..." more than twice without a stated hypothesis
- Adding try/catch to make an error disappear
- Declaring fixed without re-running the reproduction
- Disabling a lint rule, test, or type check as a "fix"
