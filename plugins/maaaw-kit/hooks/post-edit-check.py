#!/usr/bin/env python3
"""PostToolUse: after Claude edits a file, run the right formatter/linter and
feed problems straight back into the conversation so they get fixed immediately.

Wired to matcher "Edit|Write|MultiEdit".
Contract: on problems, print JSON {"decision":"block","reason":<diagnostics>}
which makes Claude see and fix the issues. Clean files exit 0 silently.

Tools are best-effort: if a linter isn't installed, that check is skipped
(never breaks your session on a machine without ruff/eslint/etc).
Auto-formatters run first (silently), then linters/type-checkers report.
"""
import json
import os
import shutil
import subprocess
import sys

TIMEOUT = 90
MAX_OUTPUT = 4000  # chars fed back to Claude


def run(cmd: list[str], cwd: str | None = None) -> tuple[int, str]:
    exe = shutil.which(cmd[0])
    if not exe:
        return (0, "")  # tool not installed -> skip silently
    try:
        p = subprocess.run(
            [exe] + cmd[1:], capture_output=True, text=True,
            timeout=TIMEOUT, cwd=cwd,
        )
        out = (p.stdout or "") + (p.stderr or "")
        return (p.returncode, out.strip())
    except subprocess.TimeoutExpired:
        return (0, "")  # don't punish slow machines
    except Exception:
        return (0, "")


def nearest(start_dir: str, marker_names: tuple[str, ...]) -> str | None:
    """Walk up from start_dir looking for a project marker; return its dir."""
    d = os.path.abspath(start_dir)
    for _ in range(15):
        for m in marker_names:
            if os.path.exists(os.path.join(d, m)):
                return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent
    return None


def check_python(path: str) -> list[str]:
    problems = []
    run(["ruff", "format", "--quiet", path])            # auto-format
    code, out = run(["ruff", "check", "--fix", path])   # auto-fix, report rest
    if code != 0 and out:
        problems.append(f"[ruff] {out}")
    return problems


def has_config(proj: str | None, names: tuple[str, ...], pkg_key: str | None = None) -> bool:
    """True if the project dir has any of the config files (or package.json key)."""
    if not proj:
        return False
    import glob as _glob
    for n in names:
        if _glob.glob(os.path.join(proj, n)):
            return True
    if pkg_key:
        try:
            pkg = json.load(open(os.path.join(proj, "package.json"), encoding="utf-8"))
            return pkg_key in pkg
        except Exception:
            pass
    return False


def check_typescript(path: str) -> list[str]:
    problems = []
    proj = nearest(os.path.dirname(path), ("package.json",))
    # Only run tools the repo has actually opted into — a globally-installed
    # eslint/prettier running config-less would spam errors / fight repo style.
    if has_config(proj, (".prettierrc*", "prettier.config.*"), "prettier"):
        run(["prettier", "--write", "--log-level", "silent", path])
    if has_config(proj, ("eslint.config.*", ".eslintrc*"), "eslintConfig"):
        code, out = run(["eslint", "--fix", path], cwd=proj)
        if code != 0 and out:
            problems.append(f"[eslint] {out}")
    # Full tsc is too slow per-edit; rely on eslint + the Stop-hook oracle
    return problems


def check_csharp(path: str) -> list[str]:
    problems = []
    # Find nearest dir containing a .csproj/.sln (dotnet format needs a project)
    proj = None
    d = os.path.dirname(os.path.abspath(path))
    for _ in range(15):
        if any(f.endswith((".csproj", ".sln", ".slnx")) for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))):
            proj = d
            break
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    if proj:
        code, out = run(["dotnet", "format", "--include", path,
                         "--verify-no-changes", "--verbosity", "quiet"], cwd=proj)
        if code != 0:
            # Auto-fix, then verify again; report anything formatting can't fix
            run(["dotnet", "format", "--include", path, "--verbosity", "quiet"], cwd=proj)
            code2, out2 = run(["dotnet", "format", "--include", path,
                               "--verify-no-changes", "--verbosity", "quiet"], cwd=proj)
            if code2 != 0 and (out2 or out):
                problems.append(f"[dotnet format] {(out2 or out)}")
    return problems


def check_powershell(path: str) -> list[str]:
    problems = []
    pwsh = shutil.which("pwsh") or shutil.which("powershell")
    if not pwsh:
        return problems
    script = (
        "if (Get-Module -ListAvailable PSScriptAnalyzer) {"
        f" Invoke-ScriptAnalyzer -Path '{path}' -Severity Warning,Error |"
        " ForEach-Object { \"$($_.Severity) $($_.RuleName) L$($_.Line): $($_.Message)\" } }"
    )
    try:
        p = subprocess.run([pwsh, "-NoProfile", "-NonInteractive", "-Command", script],
                           capture_output=True, text=True, timeout=TIMEOUT)
        out = (p.stdout or "").strip()
        if out:
            problems.append(f"[PSScriptAnalyzer] {out}")
    except Exception:
        pass
    return problems


def extract_paths(tool_input: dict) -> list[str]:
    paths: list[str] = []
    for key in ("file_path", "path"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            paths.append(value)
    for key in ("edits", "files", "changes"):
        items = tool_input.get(key) or []
        if isinstance(items, dict):
            items = [items]
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                for pkey in ("file_path", "path"):
                    value = item.get(pkey)
                    if isinstance(value, str) and value:
                        paths.append(value)
    return sorted(set(paths))


DISPATCH = {
    ".py": check_python,
    ".ts": check_typescript, ".tsx": check_typescript,
    ".js": check_typescript, ".jsx": check_typescript, ".mjs": check_typescript,
    ".cs": check_csharp,
    ".ps1": check_powershell, ".psm1": check_powershell, ".psd1": check_powershell,
}


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    ti = data.get("tool_input") or {}
    # Edit/Write/MultiEdit all carry file_path today; fall back defensively.
    path = ti.get("file_path") or ti.get("path") or ""
    ext = os.path.splitext(path)[1].lower()
    checker = DISPATCH.get(ext)
    if not checker or not os.path.isfile(path):
        sys.exit(0)

    problems = checker(path)
    if problems:
        reason = "\n".join(problems)[:MAX_OUTPUT]
        print(json.dumps({
            "decision": "block",
            "reason": (
                f"Automated checks found issues in {os.path.basename(path)} "
                f"(auto-formatting was already applied):\n{reason}\n\n"
                "Fix these now. Do NOT disable rules to silence them."
            ),
        }))
    sys.exit(0)


if __name__ == "__main__":
    main()
