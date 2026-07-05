---
description: Interview-driven repo bootstrap — writes .agent/kit.json (oracle, guard level, dials), installs rules artifacts, seeds memory
argument-hint: '[blank, or notes about the project]'
---
Bootstrap the current repo for the kit via a short interview. Context from me: $ARGUMENTS

1. Recon first (use repo-scout if the repo is large): stacks, entry points, real build/test/lint commands — RUN each candidate command to confirm it works.
2. Run `maaaw init`, then interview me (one compact question block, sensible defaults pre-filled from recon) and write the answers into `.agent/kit.json`:
   - `oracle`: the verified test/build command (consumed by /loop and the Stop hook)
   - `guardLevel`: relaxed / standard / strict (consumed by the guard hook)
   - `dials.auditDepth` + `dials.paranoia` (consumed by /audit and /grill)
   - `stacks` (override detection only if recon was wrong), `secondAgents` I actually use (check `maaaw bridge detect`)
3. Seed `.agent/rules.md` with this repo's law (verified commands, landmines recon found, intentional weirdness — ask for anything you can't infer) and run `maaaw install` for the tools detected in this repo.
4. Capture the first memory record: `maaaw memory add` with the most important repo fact recon surfaced. Ask once: commit `.agent/memory/` (team learning) or gitignore it (private)?
5. Confirm the wiring: `maaaw doctor --hooks` must be healthy. Tell me the oracle for /loop.
Next: /audit-swarm for a baseline health check, /bridge if I use other agent CLIs here.
