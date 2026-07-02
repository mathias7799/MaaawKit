#!/usr/bin/env python3
"""Stop hook: oracle-driven verification loop with trust gating.

Reads .claude/loop.json (or .codex/loop.json when exported to Codex). Claude
may not stop while the oracle fails, within an iteration budget.

SECURITY — the oracle is executed via the shell, so the loop file is treated
as dangerous input. It is refused (with a warning, never executed) unless BOTH:
  1. it contains  "trusted": true  (written by the /loop command), and
  2. it is NOT tracked in git — a loop file committed into a cloned repo is
     exactly the attack vector; locally created ones are untracked.

Loop file schema (managed fields: iteration, last_failure_sig):
{
  "trusted": true,
  "created_by": "MaaawKit",   // optional but recommended
  "oracle": "dotnet test",
  "max_iterations": 10,
  "timeout_seconds": 600,     // optional, oracle timeout (default 600)
  "max_output": 6000,         // optional, chars of failure fed back
  "goal": "optional"
}
"""
import hashlib
import json
import os
import subprocess
import sys
import time

DEFAULT_TIMEOUT = 600
DEFAULT_MAX_OUTPUT = 6000


def allow_stop() -> None:
    sys.exit(0)


def find_state(cwd: str) -> str | None:
    for rel in (".claude/loop.json", ".codex/loop.json"):
        p = os.path.join(cwd, *rel.split("/"))
        if os.path.isfile(p):
            return p
    return None


def git_tracked(path: str, cwd: str) -> bool:
    try:
        rel = os.path.relpath(path, cwd)
        r = subprocess.run(["git", "ls-files", "--error-unmatch", "--", rel],
                           capture_output=True, timeout=10, cwd=cwd)
        return r.returncode == 0
    except Exception:
        return False  # no git / error -> treat as untracked


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        allow_stop()

    cwd = data.get("cwd") or os.getcwd()
    state_path = find_state(cwd)
    if not state_path:
        allow_stop()

    try:
        with open(state_path, encoding="utf-8") as f:
            state = json.load(f)
        oracle = state["oracle"]
        max_iter = int(state["max_iterations"])
        iteration = int(state.get("iteration", 0))
    except Exception as e:
        print(f"loop file invalid ({e}); loop cancelled.", file=sys.stderr)
        try:
            os.remove(state_path)
        except OSError:
            pass
        allow_stop()

    # ---- trust gate ----
    if state.get("trusted") is not True or git_tracked(state_path, cwd):
        reason = ("missing \"trusted\": true" if state.get("trusted") is not True
                  else "the loop file is tracked in git (possible untrusted repo content)")
        print(json.dumps({"systemMessage": (
            f"⚠️ maaaw-kit refused to execute the verification-loop oracle in "
            f"{os.path.relpath(state_path, cwd)}: {reason}. The oracle was NOT run. "
            "If this loop is yours, recreate it via /loop (which writes a trusted, "
            "untracked file); otherwise delete the file — treat loop configs from "
            "cloned repos as untrusted.")}))
        allow_stop()

    if max_iter <= 0 or iteration >= max_iter:
        try:
            os.remove(state_path)
        except OSError:
            pass
        print(json.dumps({"systemMessage": (
            f"Loop budget exhausted ({iteration}/{max_iter}). Stopping. "
            "Report remaining failures honestly — do not claim success.")}))
        allow_stop()

    timeout = int(state.get("timeout_seconds", DEFAULT_TIMEOUT))
    max_out = int(state.get("max_output", DEFAULT_MAX_OUTPUT))

    started = time.strftime("%H:%M:%S")
    try:
        p = subprocess.run(oracle, shell=True, cwd=cwd, capture_output=True,
                           text=True, timeout=timeout)
        passed = p.returncode == 0
        output = ((p.stdout or "") + "\n" + (p.stderr or "")).strip()
    except subprocess.TimeoutExpired:
        passed = False
        output = f"Oracle timed out after {timeout}s: {oracle}"
    except Exception as e:
        passed = False
        output = f"Oracle failed to run: {e}"
    ended = time.strftime("%H:%M:%S")

    if passed:
        try:
            os.remove(state_path)
        except OSError:
            pass
        print(json.dumps({"systemMessage": (
            f"✅ Loop complete: oracle passed after {iteration} fix iteration(s) "
            f"[{started}–{ended}].\nOracle: {oracle}\n{output[-1500:]}")}))
        allow_stop()

    # stall detection: same failure signature three times running
    sig = hashlib.sha1(output[-2000:].encode("utf-8", "replace")).hexdigest()[:12]
    same = state.get("last_failure_sig") == sig
    streak = int(state.get("failure_streak", 0)) + 1 if same else 1

    state.update({"iteration": iteration + 1,
                  "last_failure_sig": sig, "failure_streak": streak})
    tmp = state_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, state_path)

    stall = ("\n⚠️ STALLED: this exact failure has now survived "
             f"{streak} consecutive iterations. Stop patching — re-read the full "
             "output, question the layer (test? spec? approach?), and re-plan "
             "(deep-thinking skill step 3) before the next attempt."
             ) if streak >= 3 else ""
    goal = state.get("goal", "")
    tail = output[-max_out:]
    print(json.dumps({"decision": "block", "reason": (
        f"🔄 Verification loop — iteration {iteration + 1}/{max_iter} "
        f"[oracle ran {started}–{ended}].\n"
        + (f"GOAL: {goal}\n" if goal else "")
        + f"ORACLE: {oracle}\n--- oracle output (tail) ---\n{tail}\n--- end ---\n"
        f"{stall}\n"
        "Pick the FIRST/most-upstream failure, smallest real fix, never "
        "skip/delete tests or loosen assertions. Commit each improvement. "
        "To cancel: delete the loop file and explain why.")}))
    sys.exit(0)


if __name__ == "__main__":
    main()
