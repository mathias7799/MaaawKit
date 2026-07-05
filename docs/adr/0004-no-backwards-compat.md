# ADR-0004: no backwards compatibility with 2.6 (owner directive)

**Accepted, 2026-07-05.** 3.0 is a clean break: Python deleted the moment its
TS replacement landed (not stubbed), one loop-file location (.agent/loop.json),
no legacy .claude/memory injection, no legacy marker migration, no memory
importer, no compat pointers.

Why: 2.6 had no external install base worth a compat matrix, and every compat
path is code that must be tested, secured, and eventually removed. The
roadmap's deprecation-stub and migrate-command items were explicitly waived;
docs/MIGRATION-3.0.md documents the manual (sub-15-minute) upgrade instead.
