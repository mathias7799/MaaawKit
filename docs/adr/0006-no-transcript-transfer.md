# ADR-0006: no transcript-level session transfer

**Accepted, 3.0 (binding non-goal).** Handoffs carry STATE (goal, status,
decisions, next steps, verification, relevant memory ids) — never vendor
conversation transcripts.

Why: vendor session formats are undocumented quicksand that changes without
notice; transcripts leak prompt-injection surface across agents; and a good
state handoff is strictly more useful to the receiving model than someone
else's chat log. `--resume` uses vendor thread ids where a vendor supports
them, which is thread continuation, not transcript transfer.
