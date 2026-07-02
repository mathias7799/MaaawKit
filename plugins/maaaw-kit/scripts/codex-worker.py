#!/usr/bin/env python3
"""Delegate a bounded task from Claude Code to Codex CLI.

MaaawKit uses this as a safe bridge pattern:
- Claude remains the interactive orchestrator.
- Codex runs as a bounded worker through `codex exec`.
- Write-capable tasks run in an isolated git worktree.
- Results, prompts, and optional patches are written back to .codex/.

The script is intentionally stdlib-only and safe to dry-run by default.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TO_CODEX = HERE / "to-codex.py"
WRITE_MODES = {"implementation-worktree", "test-fix", "backend-task"}
READ_MODES = {"review-only", "security-pass"}
ALL_MODES = sorted(WRITE_MODES | READ_MODES)


def run(cmd: list[str], cwd: Path, timeout: int | None = None, check: bool = False) -> subprocess.CompletedProcess[str]:
    p = subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True, timeout=timeout)
    if check and p.returncode != 0:
        joined = " ".join(cmd)
        raise SystemExit(f"Command failed ({p.returncode}): {joined}\nSTDOUT:\n{p.stdout}\nSTDERR:\n{p.stderr}")
    return p


def git_root(path: Path) -> Path:
    p = run(["git", "rev-parse", "--show-toplevel"], path)
    if p.returncode == 0 and p.stdout.strip():
        return Path(p.stdout.strip()).resolve()
    return path.resolve()


def current_branch(root: Path) -> str:
    p = run(["git", "branch", "--show-current"], root)
    return p.stdout.strip() or "HEAD"


def require_git(root: Path) -> None:
    p = run(["git", "rev-parse", "--is-inside-work-tree"], root)
    if p.returncode != 0:
        raise SystemExit("Codex worker implementation modes require a Git repository. Use review-only or initialize git first.")


def slugify(text: str, max_len: int = 48) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    s = re.sub(r"-+", "-", s)
    return (s[:max_len].strip("-") or "task")


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def export_codex(target: Path, task: str, oracle: str | None, install_skills: bool, write_config: bool, install_hooks: bool) -> None:
    cmd = [sys.executable, str(TO_CODEX), "--repo-root", str(target), "--goal", task]
    if oracle:
        cmd += ["--oracle", oracle]
    if install_skills:
        cmd.append("--install-skills")
    if write_config:
        cmd.append("--write-config")
    if install_hooks:
        cmd.append("--install-hooks")
    run(cmd, target, timeout=120, check=True)


def build_prompt(task: str, mode: str, oracle: str | None, result_name: str) -> str:
    write_allowed = mode in WRITE_MODES
    lines = [
        "# Codex Worker Task",
        "",
        "You are running as a bounded Codex worker delegated by a Claude Code session through MaaawKit.",
        "Claude is the orchestrator. You are the worker. Keep the task narrow and return a reviewable result.",
        "",
        f"## Mode\n{mode}",
        "",
        "## Task",
        task.strip(),
        "",
        "## Operating rules",
        "- Read AGENTS.md and .codex/brief.md first if present.",
        "- Keep changes minimal and local to the task.",
        "- Do not refactor unrelated code.",
        "- Do not commit, push, publish, or open pull requests.",
        "- Do not edit secrets, credentials, .env files, auth tokens, or private keys.",
        "- Do not weaken tests, disable rules, or hide failures.",
        "- If information is missing, make the best safe assumption and record it under Assumptions.",
    ]
    if write_allowed:
        lines += [
            "- You may edit files in this isolated worktree.",
            "- After editing, run the smallest relevant verification command.",
        ]
    else:
        lines += [
            "- Do not edit files. Return findings, suggested patches, and exact file paths only.",
            "- Treat the repository as read-only even if the sandbox would allow writes.",
        ]
    if oracle:
        lines += ["", "## Verification oracle", f"Run this if the mode permits command execution: `{oracle}`"]
    lines += [
        "",
        "## Required final response format",
        "Return Markdown with exactly these sections:",
        "",
        "# Codex Worker Result",
        "",
        "## Status",
        "success | partial | failed",
        "",
        "## Summary",
        "What you did or found, in 3-7 bullets.",
        "",
        "## Assumptions",
        "Any assumptions made. Use 'None' if none.",
        "",
        "## Changed files",
        "List changed files, or 'None' for review-only mode.",
        "",
        "## Verification run",
        "Commands run and exact pass/fail/not-run status.",
        "",
        "## Findings or implementation notes",
        "Evidence with file paths and line references where possible.",
        "",
        "## Needs Claude review",
        "Anything Claude should verify before accepting the result.",
        "",
        f"Result file expected by MaaawKit: `.codex/results/{result_name}`",
    ]
    return "\n".join(lines) + "\n"


def create_worktree(root: Path, task_slug: str, worktree_root: str | None, branch: str | None) -> tuple[Path, str]:
    require_git(root)
    repo_name = root.name
    branch_name = branch or f"codex/{task_slug}"
    parent = Path(worktree_root).resolve() if worktree_root else root.parent
    wt = parent / f"{repo_name}-codex-{task_slug}"
    if wt.exists():
        raise SystemExit(f"Worktree path already exists: {wt}\nDelete it or pass --worktree-root/--branch for a fresh worker.")
    run(["git", "worktree", "add", "-b", branch_name, str(wt), "HEAD"], root, timeout=120, check=True)
    return wt.resolve(), branch_name


def codex_command(codex_cmd: str, sandbox: str, output: Path, prompt_file: Path, extra_args: list[str]) -> list[str]:
    return [codex_cmd, "exec", "--sandbox", sandbox, "-o", str(output), *extra_args, "-"]


def main() -> int:
    ap = argparse.ArgumentParser(description="Delegate a bounded task to Codex CLI through MaaawKit.")
    ap.add_argument("--task", required=True, help="Task to give Codex.")
    ap.add_argument("--mode", choices=ALL_MODES, default="review-only")
    ap.add_argument("--repo-root", default=".")
    ap.add_argument("--oracle")
    ap.add_argument("--run", action="store_true", help="Actually invoke codex exec. Without this, only prepare files and launch commands.")
    ap.add_argument("--codex-cmd", default="codex")
    ap.add_argument("--codex-arg", action="append", default=[], help="Extra arg for codex exec, repeatable. Example: --codex-arg --ignore-user-config")
    ap.add_argument("--sandbox", help="Override sandbox. Defaults to read-only for review modes, workspace-write for worktree modes.")
    ap.add_argument("--timeout", type=int, default=3600)
    ap.add_argument("--worktree-root", help="Directory where implementation worktrees are created. Default: parent of repo.")
    ap.add_argument("--branch", help="Worker branch name. Default: codex/<task-slug>.")
    ap.add_argument("--install-skills", action="store_true", default=True)
    ap.add_argument("--no-install-skills", dest="install_skills", action="store_false")
    ap.add_argument("--write-config", action="store_true", default=True)
    ap.add_argument("--no-write-config", dest="write_config", action="store_false")
    ap.add_argument("--install-hooks", action="store_true", help="Also export optional Codex hooks; user must review/trust in /hooks.")
    args = ap.parse_args()

    root = git_root(Path(args.repo_root))
    task_slug = slugify(args.task)
    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    result_name = f"{stamp}-{task_slug}.md"
    patch_name = f"{stamp}-{task_slug}.patch"
    original_results = root / ".codex" / "results"
    original_tasks = root / ".codex" / "tasks"
    original_results.mkdir(parents=True, exist_ok=True)
    original_tasks.mkdir(parents=True, exist_ok=True)

    target = root
    worker_branch = None
    worktree = None
    if args.mode in WRITE_MODES:
        worktree, worker_branch = create_worktree(root, task_slug, args.worktree_root, args.branch)
        target = worktree

    export_codex(target, args.task, args.oracle, args.install_skills, args.write_config, args.install_hooks)

    prompt = build_prompt(args.task, args.mode, args.oracle, result_name)
    prompt_file = target / ".codex" / "tasks" / result_name
    result_file = target / ".codex" / "results" / result_name
    write(prompt_file, prompt)
    # Mirror task prompt in orchestrator repo for traceability when worker is a worktree.
    write(original_tasks / result_name, prompt)

    sandbox = args.sandbox or ("workspace-write" if args.mode in WRITE_MODES else "read-only")
    launch = codex_command(args.codex_cmd, sandbox, result_file, prompt_file, args.codex_arg)
    launch_text = "cat " + str(prompt_file) + " | " + " ".join(launch)

    status = "prepared"
    rc = None
    if args.run:
        if shutil.which(args.codex_cmd) is None:
            raise SystemExit(f"Could not find Codex CLI command '{args.codex_cmd}' on PATH. Prepared task at {prompt_file}.")
        with prompt_file.open("r", encoding="utf-8") as stdin:
            p = subprocess.run(launch, cwd=str(target), stdin=stdin, text=True,
                               capture_output=True, timeout=args.timeout)
        rc = p.returncode
        status = "ran" if rc == 0 else "failed"
        # Keep raw logs for Claude inspection.
        write(target / ".codex" / "results" / f"{stamp}-{task_slug}.stdout.txt", p.stdout or "")
        write(target / ".codex" / "results" / f"{stamp}-{task_slug}.stderr.txt", p.stderr or "")
        if args.mode in WRITE_MODES:
            patch = run(["git", "diff", "--binary", "HEAD"], target, timeout=120)
            stat = run(["git", "diff", "--stat", "HEAD"], target, timeout=120)
            write(target / ".codex" / "results" / patch_name, patch.stdout)
            write(target / ".codex" / "results" / f"{stamp}-{task_slug}.stat.txt", stat.stdout)
            # Mirror result files into original repo for Claude's current session.
            for f in (result_name, patch_name, f"{stamp}-{task_slug}.stat.txt", f"{stamp}-{task_slug}.stdout.txt", f"{stamp}-{task_slug}.stderr.txt"):
                src = target / ".codex" / "results" / f
                if src.exists():
                    shutil.copy2(src, original_results / f)
    else:
        prepared = f"""# Codex Worker Prepared

Status: prepared, not run.

Run from target directory:

```bash
{launch_text}
```

Target directory: `{target}`
Prompt file: `{prompt_file}`
Result file: `{result_file}`
"""
        if worktree:
            prepared += f"Worker branch: `{worker_branch}`\nWorker worktree: `{worktree}`\n"
        write(result_file, prepared)
        if result_file != original_results / result_name:
            shutil.copy2(result_file, original_results / result_name)

    summary = [
        "Codex worker " + status + ".",
        f"Mode: {args.mode}",
        f"Target: {target}",
        f"Prompt: {prompt_file}",
        f"Result: {result_file}",
        f"Mirror result: {original_results / result_name}",
    ]
    if worker_branch:
        summary.append(f"Worker branch: {worker_branch}")
    if worktree:
        summary.append(f"Worker worktree: {worktree}")
    if rc is not None:
        summary.append(f"codex exec exit code: {rc}")
    if args.install_hooks:
        summary.append("Codex hooks exported. In Codex, run /hooks and review/trust them before relying on them.")
    summary.append("Claude should inspect the result and diff before applying or merging any Codex changes.")
    print("\n".join(summary))
    return 0 if rc in (None, 0) else rc


if __name__ == "__main__":
    raise SystemExit(main())
