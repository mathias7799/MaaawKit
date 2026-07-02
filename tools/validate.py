#!/usr/bin/env python3
"""Repo validation for CI and pre-commit: JSON validity, skill/command/agent
frontmatter, skill name<->directory match, balanced code fences, no stray
${CLAUDE_PLUGIN_ROOT} in command markdown. Exit 0 = clean."""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
errors: list[str] = []

for f in glob.glob(".claude-plugin/*.json") + glob.glob("plugins/**/*.json", recursive=True):
    try:
        json.load(open(f, encoding="utf-8"))
    except Exception as e:
        errors.append(f"invalid JSON: {f}: {e}")

md = (glob.glob("plugins/*/skills/*/SKILL.md")
      + glob.glob("plugins/*/skills/*/references/*.md")
      + glob.glob("plugins/*/commands/*.md")
      + glob.glob("plugins/*/agents/*.md")
      + glob.glob("*.md"))
for f in md:
    text = open(f, encoding="utf-8").read()
    if text.count("```") % 2:
        errors.append(f"unbalanced code fences: {f}")

for f in glob.glob("plugins/*/skills/*/SKILL.md"):
    text = open(f, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        errors.append(f"missing frontmatter: {f}")
        continue
    fm = m.group(1)
    name = re.search(r"^name:\s*(\S+)", fm, re.M)
    if "description:" not in fm or not name:
        errors.append(f"frontmatter needs name+description: {f}")
    elif name.group(1) != os.path.basename(os.path.dirname(f)):
        errors.append(f"skill name != directory: {f}")

for f in glob.glob("plugins/*/commands/*.md") + glob.glob("plugins/*/agents/*.md"):
    text = open(f, encoding="utf-8").read()
    if not re.match(r"^---\n.*?\n---\n", text, re.S):
        errors.append(f"missing frontmatter: {f}")
    if "commands/" in f and "${CLAUDE_PLUGIN_ROOT}" in text:
        errors.append(f"${{CLAUDE_PLUGIN_ROOT}} in command markdown (only expands in hooks/mcp config): {f}")

# docs count drift: README/marketplace claims must match reality
n_skills = len(glob.glob("plugins/maaaw-kit/skills/*/SKILL.md"))
n_agents = len(glob.glob("plugins/maaaw-kit/agents/*.md"))
n_cmds = len(glob.glob("plugins/maaaw-kit/commands/*.md"))
for doc in ("README.md", ".claude-plugin/marketplace.json"):
    txt = open(doc, encoding="utf-8").read()
    for n, label in ((n_skills, "skills"), (n_agents, "agents"), (n_cmds, "commands")):
        claims = re.findall(r"(\d+)\s+(?:engineering |specialist |slash )?" + label, txt)
        for c in claims:
            if int(c) != n:
                errors.append(f"count drift in {doc}: claims {c} {label}, actual {n}")

# release hygiene: no placeholder repository metadata
for f in glob.glob("**/*", recursive=True):
    if os.path.isdir(f):
        continue
    try:
        txt = open(f, encoding="utf-8").read()
    except Exception:
        continue
    if ("github.com/" + "OWNER/") in txt or ("<" + "you>/") in txt:
        errors.append(f"placeholder repository metadata remains: {f}")

# Codex hooks template must use current event-keyed shape, not a flat conceptual list.
codex_hooks = "plugins/maaaw-kit/templates/codex/hooks.json.template"
if os.path.isfile(codex_hooks):
    try:
        data = json.load(open(codex_hooks, encoding="utf-8"))
        hooks = data.get("hooks")
        if not isinstance(hooks, dict):
            errors.append("Codex hooks template must have object hooks keyed by event name")
        else:
            for event in ("SessionStart", "PreToolUse", "PostToolUse", "Stop"):
                if event not in hooks:
                    errors.append(f"Codex hooks template missing {event}")
    except Exception as e:
        errors.append(f"invalid Codex hooks template: {e}")

for e in errors:
    print("FAIL:", e)
print(f"{len(errors)} problem(s)" if errors else "validation clean")
sys.exit(1 if errors else 0)
