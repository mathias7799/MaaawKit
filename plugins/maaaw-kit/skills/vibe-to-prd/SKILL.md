---
name: vibe-to-prd
description: Turn a vague idea, vibe, voice-note-style ramble, or "I want an app that kinda..." into a sharp PRD optimized for agentic coding (Claude Code can build directly from it). Use when the user describes a product/feature loosely, asks for a PRD/spec/requirements doc, wants to "spec this out", or is about to vibe-code something bigger than a script.
---

# Vibe → PRD

**Declare your read first**: open with a one-line interpretation of the idea; ask at most ONE clarifying question, and only when interpretations genuinely diverge.

The customer here is an AI coding agent (and future-you). A good agentic PRD is not a corporate PRD: no market analysis theater, no OKR poetry. It's the minimum document that lets an agent build the right thing without asking questions — which means it must be ruthlessly concrete about behavior and equally explicit about what's OUT.

## Step 1 — Extract, don't interrogate
Pull everything the vibe already contains: the job-to-be-done, the user, implied platform, implied data, emotional requirements ("feels fast", "dead simple" — these ARE requirements, translate them: feels fast → p95 interaction <100ms, optimistic UI).

Then ask ONLY the questions whose answers change the build — usually 3–5 max:
- Who uses it and how many? (solo tool vs multi-user changes everything: auth, DB, hosting)
- What's the ONE workflow that must be great? (the spine — everything else is decoration)
- Where does data live and does it survive? (throwaway / local / cloud, sync?)
- Constraints: stack preference, deadline, budget, must-integrate-with?
Make smart defaults for everything else and STATE them in the PRD as assumptions — a wrong-but-stated assumption gets corrected in review; an unasked question becomes a wrong product.

## Step 2 — Write the PRD (this exact structure)

```markdown
# <Name> — PRD v0.1
## One-liner
<who> can <do what> so that <outcome>. 
## The spine
The single workflow that defines success, written as a walkthrough:
"User opens X → sees Y → does Z → gets W." Numbered, concrete, with real example data.
## Users & scale assumptions
<solo / N users / public>, <devices>, <auth: none/simple/real>
## Functional requirements
FR-1 … FR-n. Each: one testable sentence + acceptance criterion.
  ✅ "FR-3: Deleting a note moves it to Trash; Trash items are purged after 30 days."
  ❌ "The app should handle notes well."
## Explicitly OUT of scope (v1)
The anti-scope list. Longer than you think. Every cut item: one line + "(v2 candidate)" or "(never)".
## Data model (sketch)
Entities, key fields, relations — enough for a schema, not a thesis.
## Stack & architecture decision
Chosen stack + WHY in one line each. Default to the user's home stacks
(.NET API / Next.js front / Python for data-ish / PowerShell for ops tooling) unless the job says otherwise.
## Non-functional bar
Only the ones that matter for THIS product: perf targets, offline?, a11y level, secrets handling.
## Milestones (each independently shippable & verifiable)
M1: <spine works end-to-end, ugly> → verify: <command/manual script>
M2: <...> 
## Open questions / stated assumptions
Assumptions I made: ... (correct me). Genuinely open: ...
## Agent build notes
Oracle command for the verification loop, definition of done, anything the coding agent must not do.
```

## Rules
- **The spine section is the PRD.** If the walkthrough is vague, everything downstream is fiction. Spend the effort there, with real example data ("a note titled 'Mødereferat 3/7'"), not placeholders.
- Every FR must be checkable by a test or a 10-second manual action. If you can't write its acceptance criterion, it's not a requirement yet — move it to Open Questions.
- Out-of-scope is a first-class section — it's what keeps agentic builds from sprawling. When in doubt, cut to v2.
- Right-size the ceremony: a weekend tool gets a 1-page PRD; don't inflate. A multi-user product gets the full structure.
- End by offering the natural next step: "want me to start M1 with `/loop` using the oracle above?"
