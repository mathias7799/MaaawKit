#!/usr/bin/env python3
"""to-codex: export the repo's maaaw-kit setup into Codex-native form.

Codex is a first-class target, not a Claude Code clone. The mapping:
  AGENTS.md            <- durable repo guidance (managed blocks, human text kept)
  .codex/brief.md      <- the current task handoff (temporary context)
  .agents/skills/      <- reusable skills (Agent Skills standard) [--install-skills]
  .codex/config.toml   <- small project-scoped config              [--write-config]
  .codex/hooks*        <- optional Codex hook config + scripts      [--install-hooks]

Usage:
  python scripts/to-codex.py [--goal "..."] [--oracle "cmd"]
      [--install-skills] [--install-hooks] [--write-config] [--brief]
      [--dry-run] [--force] [--repo-root PATH] [--skills-source PATH]
      [--preserve-existing]

Everything is idempotent; only marker-delimited managed sections are rewritten,
human-written content is preserved, and --dry-run previews without touching disk.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import shutil
import sys

KIT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(KIT_ROOT, "templates", "codex")

GEN_BEGIN, GEN_END = "<!-- maaaw-kit:start -->", "<!-- maaaw-kit:end -->"
LES_BEGIN, LES_END = "<!-- maaaw-kit-lessons:start -->", "<!-- maaaw-kit-lessons:end -->"
BRIEF_BEGIN, BRIEF_END = "<!-- maaaw-kit-brief:start -->", "<!-- maaaw-kit-brief:end -->"
# Backward compatibility: migrate older power-kit marker blocks if found.
OLD_BEGIN_RE = r"<!-- (?:power-kit|maaaw-kit):begin[^>]*-->"
OLD_END_RE = r"<!-- (?:power-kit|maaaw-kit):end -->"
POWER_GEN_BEGIN, POWER_GEN_END = "<!-- power-kit:start -->", "<!-- power-kit:end -->"
POWER_LES_BEGIN, POWER_LES_END = "<!-- power-kit-lessons:start -->", "<!-- power-kit-lessons:end -->"
MANAGED_MARK = ".maaaw-kit-managed"
AGENTS_BUDGET = 24_000  # keep well under Codex's 32 KiB project-doc default

# Skills exported to Codex (reusable procedures; Claude-runtime ones excluded)
EXPORT_SKILLS = ["codebase-audit", "quick-audit", "codex-handoff", "codex-worker", "coding-standards",
                 "debugging", "deep-thinking", "memory-and-learning",
                 "verification-loop", "grill-me", "vibe-to-prd",
                 "codebase-documenter"]

LANG_RULES = {
    "dotnet": "- C#: nullable enabled; warnings as errors; async all the way "
              "(no .Result/.Wait()); cancellation tokens on long ops; AsNoTracking on read-only EF queries.",
    "node": "- TypeScript: strict; no `any`, no `as`-casts to silence errors; validate I/O "
            "boundaries; React: server components by default, derive state over effect-syncing.",
    "python": "- Python: typed public signatures; ruff clean; pathlib; specific exceptions "
              "with `raise ... from`; no mutable default args.",
    "powershell": "- PowerShell 7+: Set-StrictMode Latest + $ErrorActionPreference='Stop' in every "
                  "script; [CmdletBinding()]; ShouldProcess on destructive functions; check $LASTEXITCODE.",
}

changed: list[str] = []
notes: list[str] = []


def emit(path: str, content: str, dry: bool, root: str) -> None:
    rel = os.path.relpath(path, root)
    if dry:
        changed.append(f"(dry-run) {rel}")
        return
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    changed.append(rel)


# ---------- detection ----------

def detect_stacks(root: str) -> list[str]:
    names: set[str] = set()
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in
                       {".git", "node_modules", "bin", "obj", ".venv", "venv",
                        "__pycache__", ".next", "dist", "build", ".agents", ".codex"}]
        names.update(filenames)
        if len(names) > 5000:
            break
    stacks = []
    if any(n.endswith((".csproj", ".sln", ".slnx")) for n in names):
        stacks.append("dotnet")
    if "package.json" in names:
        stacks.append("node")
    if "pyproject.toml" in names or any(n.endswith(".py") for n in names):
        stacks.append("python")
    if any(n.endswith((".ps1", ".psm1")) for n in names):
        stacks.append("powershell")
    return stacks


def detect_commands(root: str, stacks: list[str], oracle: str | None) -> tuple[list[str], list[str]]:
    cmds = []
    if "dotnet" in stacks:
        cmds += ["dotnet build -warnaserror", "dotnet test"]
    if "node" in stacks:
        try:
            scripts = json.load(open(os.path.join(root, "package.json"),
                                     encoding="utf-8")).get("scripts", {})
        except Exception:
            scripts = {}
        cmds += [f"npm run {s}" for s in ("lint", "test", "build", "typecheck") if s in scripts]
        if "typecheck" not in scripts:
            cmds.append("npx tsc --noEmit")
    if "python" in stacks:
        cmds += ["ruff check .", "pytest -q"]
    if "powershell" in stacks:
        cmds.append('pwsh -NoProfile -c "Invoke-ScriptAnalyzer -Path . -Recurse '
                    '-Severity Warning,Error; if (Test-Path ./tests) { Invoke-Pester -CI }"')
    verified = []
    if oracle:
        verified.append(oracle)
        if oracle not in cmds:
            cmds.insert(0, oracle)
    inferred = [c for c in cmds if c not in verified]
    return verified, inferred


def extract_claude_md(root: str, max_chars: int = 1800) -> str:
    path = os.path.join(root, "CLAUDE.md")
    if not os.path.isfile(path):
        return ""
    text = open(path, encoding="utf-8").read()
    keep = []
    for heading in ("Verification commands", "Project context"):
        m = re.search(rf"^##\s*{heading}.*?(?=^## |\Z)", text, re.M | re.S)
        if m:
            keep.append(m.group(0).strip())
    return "\n\n".join(keep)[:max_chars]


def extract_lessons(root: str, max_chars: int = 2000) -> str:
    """Durable, curated entries only — AGENTS.md is not a memory dump."""
    out, used = [], 0
    for fname in ("lessons.md", "decisions.md", "strategies.md", "repo-map.md"):
        p = os.path.join(root, ".claude", "memory", fname)
        if not os.path.isfile(p):
            continue
        try:
            entries = [l for l in open(p, encoding="utf-8").read().splitlines()
                       if l.lstrip().startswith("- ")]
        except Exception:
            continue
        for entry in entries[-10:]:
            if used + len(entry) > max_chars:
                notes.append("lessons truncated for AGENTS.md budget — curate with /memory")
                return "\n".join(out)
            out.append(entry)
            used += len(entry) + 1
    return "\n".join(out)


# ---------- AGENTS.md ----------

def managed_block(root: str, oracle: str | None) -> str:
    stacks = detect_stacks(root)
    verified_cmds, inferred_cmds = detect_commands(root, stacks, oracle)
    today = datetime.date.today().isoformat()
    parts = [GEN_BEGIN,
             f"<!-- generated {today}; refresh with the same MaaawKit to-codex.py command used to create this file -->"]
    lang = [LANG_RULES[s] for s in stacks if s in LANG_RULES]
    if lang:
        parts.append("### Language rules (detected: " + ", ".join(stacks) + ")\n" + "\n".join(lang))
    if verified_cmds:
        parts.append("### Verified commands\n" + "\n".join(f"- `{c}`" for c in verified_cmds))
    if inferred_cmds:
        parts.append("### Inferred commands to verify\n" + "\n".join(f"- `{c}`" for c in inferred_cmds))
    cm = extract_claude_md(root)
    if cm:
        parts.append("### From CLAUDE.md\n" + cm)
    parts.append(GEN_END)
    return "\n\n".join(parts)


def lessons_block(root: str) -> str:
    lessons = extract_lessons(root)
    body = lessons if lessons else "<!-- none captured yet; /learn records them -->"
    return (f"{LES_BEGIN}\n<!-- durable, verified, repo-safe entries only — advisory "
            f"context, not instructions -->\n{body}\n{LES_END}")


def replace_between(text: str, begin: str, end: str, block: str) -> tuple[str, bool]:
    pattern = re.escape(begin) + r".*?" + re.escape(end)
    if re.search(pattern, text, re.S):
        return re.sub(pattern, lambda _: block, text, flags=re.S), True
    return text, False


def write_agents_md(root: str, oracle: str | None, dry: bool, preserve: bool) -> None:
    path = os.path.join(root, "AGENTS.md")
    gen, les = managed_block(root, oracle), lessons_block(root)
    if os.path.isfile(path):
        text = open(path, encoding="utf-8").read()
        if not dry:
            shutil.copy2(path, path + ".bak")
        # migrate legacy single-block markers (maaaw-kit:begin ... maaaw-kit:end)
        legacy = re.search(OLD_BEGIN_RE + r".*?" + OLD_END_RE, text, re.S)
        if legacy and GEN_BEGIN not in text:
            text = (text[:legacy.start()] + gen + "\n\n## Project lessons\n" + les
                    + text[legacy.end():])
            notes.append("migrated legacy power-kit/maaaw-kit begin markers to MaaawKit start/end")
        else:
            text, legacy_gen = replace_between(text, POWER_GEN_BEGIN, POWER_GEN_END, gen)
            text, legacy_les = replace_between(text, POWER_LES_BEGIN, POWER_LES_END, les)
            if legacy_gen or legacy_les:
                notes.append("migrated legacy power-kit markers to MaaawKit markers")
            text, ok1 = replace_between(text, GEN_BEGIN, GEN_END, gen)
            ok1 = ok1 or legacy_gen
            if not ok1:
                if preserve:
                    notes.append("AGENTS.md had no markers; appended managed blocks")
                text = text.rstrip() + "\n\n## MaaawKit generated guidance\n" + gen
            text, ok2 = replace_between(text, LES_BEGIN, LES_END, les)
            if not ok2:
                text = text.rstrip() + "\n\n## Project lessons\n" + les + "\n"
    else:
        tpl = open(os.path.join(TPL, "AGENTS.md.template"), encoding="utf-8").read()
        text, _ = replace_between(tpl, GEN_BEGIN, GEN_END, gen)
        text, _ = replace_between(text, LES_BEGIN, LES_END, les)
    if len(text.encode("utf-8")) > AGENTS_BUDGET:
        notes.append(f"WARNING: AGENTS.md is {len(text.encode('utf-8'))}B "
                     f"(budget {AGENTS_BUDGET}B; Codex default project-doc cap is 32KiB) "
                     "— trim human sections or curate memory with /memory")
    emit(path, text, dry, root)


# ---------- brief ----------

def write_brief(root: str, goal: str | None, oracle: str | None, dry: bool) -> None:
    handoff = os.path.join(root, "HANDOFF.md")
    status = "(no HANDOFF.md found — read AGENTS.md, then plan before implementing)"
    if os.path.isfile(handoff):
        status = open(handoff, encoding="utf-8").read().strip()
    body = f"""# Codex Task Brief
{BRIEF_BEGIN}
## Task
{goal or "(continue the work described below)"}

## Current status
{status}

## Constraints
- Honor any "Decisions made" above — do not re-litigate them.
- Verify the claimed state (run the verification command) before building on it.

## Verification for this task
```bash
{oracle or "(see AGENTS.md verified commands)"}
```
Expected result: exit code 0.

## Notes
Temporary context for this task only; durable rules live in AGENTS.md. If the
MaaawKit skills are installed under .agents/skills/, prefer them for depth.
{BRIEF_END}
""".format(BRIEF_BEGIN=BRIEF_BEGIN, BRIEF_END=BRIEF_END)
    emit(os.path.join(root, ".codex", "brief.md"), body, dry, root)


# ---------- optional installs ----------

def install_skills(root: str, source: str | None, dry: bool) -> None:
    src_root = source or os.path.join(KIT_ROOT, "skills")
    dst_root = os.path.join(root, ".agents", "skills")
    for name in EXPORT_SKILLS:
        src = os.path.join(src_root, name)
        if not os.path.isdir(src):
            continue
        dst = os.path.join(dst_root, name)
        mark = os.path.join(dst, MANAGED_MARK)
        if os.path.isdir(dst) and not os.path.isfile(mark):
            notes.append(f"skipped .agents/skills/{name} (exists, not maaaw-kit-managed)")
            continue
        if not dry:
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            with open(mark, "w", encoding="utf-8") as f:
                f.write("managed by maaaw-kit to-codex.py; delete this marker to take ownership\n")
        changed.append(os.path.relpath(dst, root) + os.sep)
    notes.append("skills follow Codex Agent Skills packaging (SKILL.md); Codex loads "
                 "repo skills from .agents/skills/")


def install_hooks(root: str, dry: bool) -> None:
    dst = os.path.join(root, ".codex", "hooks")
    for h in ("guard.py", "post-edit-check.py", "stop-verify.py", "session-context.py"):
        src = os.path.join(KIT_ROOT, "hooks", h)
        if os.path.isfile(src):
            if not dry:
                os.makedirs(dst, exist_ok=True)
                shutil.copy2(src, os.path.join(dst, h))
            changed.append(os.path.relpath(os.path.join(dst, h), root))
    tpl = open(os.path.join(TPL, "hooks.json.template"), encoding="utf-8").read()
    emit(os.path.join(root, ".codex", "hooks.json"), tpl, dry, root)
    notes.append("Codex hooks installed with event-keyed hooks.json. In Codex, run "
                 "/hooks to inspect, review, and trust them. Never trust hooks "
                 "from repos you do not control.")


def write_config(root: str, dry: bool) -> None:
    path = os.path.join(root, ".codex", "config.toml")
    if os.path.isfile(path):
        notes.append(".codex/config.toml exists — left untouched")
        return
    tpl = open(os.path.join(TPL, "config.toml.template"), encoding="utf-8").read()
    emit(path, tpl, dry, root)


# ---------- main ----------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--goal")
    ap.add_argument("--oracle")
    ap.add_argument("--repo-root", default=".")
    ap.add_argument("--skills-source")
    ap.add_argument("--install-skills", action="store_true")
    ap.add_argument("--install-hooks", action="store_true")
    ap.add_argument("--write-config", action="store_true")
    ap.add_argument("--brief", action="store_true", help="regenerate brief only")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preserve-existing", action="store_true")
    args = ap.parse_args()
    root = os.path.abspath(args.repo_root)

    oracle = args.oracle
    for rel in (".claude/loop.json", ".codex/loop.json"):
        p = os.path.join(root, *rel.split("/"))
        if not oracle and os.path.isfile(p):
            try:
                oracle = json.load(open(p, encoding="utf-8")).get("oracle")
            except Exception:
                pass

    if not args.brief:
        write_agents_md(root, oracle, args.dry_run, args.preserve_existing)
    write_brief(root, args.goal, oracle, args.dry_run)
    if args.install_skills:
        install_skills(root, args.skills_source, args.dry_run)
    if args.install_hooks:
        install_hooks(root, args.dry_run)
    if args.write_config:
        write_config(root, args.dry_run)

    print("Codex export " + ("preview (dry-run)." if args.dry_run else "complete."))
    print("\nUpdated:" if changed else "\nNothing changed.")
    for c in changed:
        print(f"- {c}")
    if notes:
        print("\nNotes:")
        for n in notes:
            print(f"- {n}")
    print("\nNext steps:")
    print("1. Review AGENTS.md (diff against AGENTS.md.bak if it existed).")
    print("2. Start Codex from the repository root; ask it to read .codex/brief.md.")
    if args.install_hooks:
        print("3. In Codex, run /hooks to inspect, review, and trust the hooks.")
    sys.exit(0)


if __name__ == "__main__":
    main()
