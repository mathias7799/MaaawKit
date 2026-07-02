---
description: Bootstrap this repo for the kit — recon-filled CLAUDE.md, memory dir, detected oracle, optional AGENTS.md
argument-hint: [blank, or notes about the project]
---
Bootstrap the current repo for productive kit use. Context from me: $ARGUMENTS

1. Recon (use repo-scout if the repo is large): stacks, entry points, real build/test/lint commands — RUN each candidate command to confirm it works.
2. Write CLAUDE.md from the kit's template with every <!-- EDIT PER REPO --> section filled from recon (verified commands, project context, intentional-weirdness list — ask me for anything you can't infer). If CLAUDE.md exists, propose a merge instead of overwriting.
3. Create `.claude/memory/` with empty lessons.md / decisions.md / repo-map.md (seed repo-map.md with any landmines recon found). Ask once: commit memory (team learning) or gitignore it (private)? Record my answer as the first lesson.
4. Tell me the detected oracle command for /loop, and offer: /audit-swarm for a baseline health check, and to-codex.py if I also use Codex on this repo.
