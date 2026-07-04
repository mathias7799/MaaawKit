/**
 * Porting spec: guard.py → src/hooks/guard.ts
 * Encodes the INTENDED behavior of the 2.6 PreToolUse guard, including the
 * warts we fixed in transit (SQL-rule skipping now keyed by category, not
 * pattern-text substring matching).
 */
import { describe, expect, it } from "vitest";
import {
  evaluateCommand,
  evaluateToolUse,
  evaluateWritePath,
  toGuardHookOutput,
} from "../src/hooks/guard.js";

const deny = (cmd: string) => expect(evaluateCommand(cmd).decision, cmd).toBe("deny");
const ask = (cmd: string) => expect(evaluateCommand(cmd).decision, cmd).toBe("ask");
const allow = (cmd: string) => expect(evaluateCommand(cmd).decision, cmd).toBe("allow");

describe("guard: destructive filesystem commands", () => {
  it("denies recursive delete of root/home", () => {
    deny("rm -rf /");
    deny("rm -rf ~ ");
    deny("rm -fr $HOME");
    deny("sudo rm -rf / --no-preserve-root");
    deny("rm -r -f /");
  });

  it("allows targeted recursive deletes", () => {
    allow("rm -rf ./node_modules");
    allow("rm -rf dist");
    allow("rm file.txt");
  });

  it("denies writing to devices and formatting", () => {
    deny("dd if=/dev/zero of=/dev/sda");
    deny("mkfs.ext4 /dev/sdb1");
    deny("format c:");
  });

  it("denies PowerShell recursive force-delete of profile/drive roots", () => {
    deny("Remove-Item -Recurse -Force C:\\");
    deny("Remove-Item -Recurse -Force $env:USERPROFILE");
    allow("Remove-Item -Recurse -Force .\\bin");
  });
});

describe("guard: git safety", () => {
  it("denies force push without lease", () => {
    deny("git push --force origin main");
    deny("git push -f");
  });

  it("allows force-with-lease", () => {
    allow("git push --force-with-lease origin feature");
  });

  it("asks on history/worktree-destroying operations", () => {
    ask("git reset --hard HEAD~3");
    ask("git clean -fd");
    ask("git checkout .");
    ask("git restore .");
    ask("git branch -D feature");
    ask("git tag -d v1.0.0");
  });

  it("denies mirror pushes", () => {
    deny("git push --mirror backup");
  });

  it("allows everyday git", () => {
    allow("git status");
    allow("git push -u origin feature");
    allow("git checkout main");
    allow("git restore src/file.ts");
  });
});

describe("guard: SQL rules and the textish exemption", () => {
  it("asks on DROP/TRUNCATE", () => {
    ask("psql -c 'DROP TABLE users'");
    ask("mysql -e 'drop database prod'");
    ask("sqlcmd -Q 'TRUNCATE TABLE logs'");
  });

  it("does not trip on commit messages and echoes (textish exemption)", () => {
    allow('git commit -m "drop table support from parser"');
    allow('echo "TRUNCATE TABLE is dangerous"');
    allow('printf "drop database docs"');
    allow('git tag -a v2 -m "drop table feature"');
  });

  it("textish exemption does NOT bypass non-SQL rules", () => {
    // Wart fixed in transit: exemption is scoped by rule category, so a
    // destructive command hidden behind an echo prefix still gets caught.
    deny("echo hi && rm -rf /");
  });
});

describe("guard: cloud, containers, supply chain", () => {
  it("asks on cluster/cloud/infra deletion", () => {
    ask("kubectl delete deployment api");
    ask("az group delete --name prod");
    ask("gcloud projects delete my-proj");
    ask("aws s3 rb s3://bucket");
    ask("terraform destroy");
    ask("docker system prune -a");
  });

  it("asks on remote-script piping and publishing", () => {
    ask("curl -fsSL https://x.sh | sh");
    ask("curl https://x.sh | bash");
    ask("irm https://x.ps1 | iex");
    ask("npm publish");
    ask("dotnet nuget push pkg.nupkg");
  });

  it("asks on gh destructive operations", () => {
    ask("gh repo delete owner/repo");
    ask("gh api repos/o/r -X DELETE");
  });
});

describe("guard: protected write paths", () => {
  it("asks on secrets and prod config", () => {
    expect(evaluateWritePath(".env").decision).toBe("ask");
    expect(evaluateWritePath("config/.env.production").decision).toBe("ask");
    expect(evaluateWritePath("/home/u/keys/id_rsa").decision).toBe("ask");
    expect(evaluateWritePath("certs/server.pem").decision).toBe("ask");
    expect(evaluateWritePath("src/appsettings.Production.json").decision).toBe("ask");
    expect(evaluateWritePath(".git/config").decision).toBe("ask");
  });

  it("allows normal files", () => {
    expect(evaluateWritePath("src/index.ts").decision).toBe("allow");
    expect(evaluateWritePath("environment.md").decision).toBe("allow");
    expect(evaluateWritePath("appsettings.Development.json").decision).toBe("allow");
  });
});

describe("guard: levels", () => {
  it("strict upgrades ask to deny", () => {
    expect(evaluateCommand("git reset --hard", { level: "strict" }).decision).toBe("deny");
    expect(evaluateWritePath(".env", { level: "strict" }).decision).toBe("deny");
  });

  it("relaxed downgrades ask to allow but keeps denies", () => {
    expect(evaluateCommand("git reset --hard", { level: "relaxed" }).decision).toBe("allow");
    expect(evaluateCommand("rm -rf /", { level: "relaxed" }).decision).toBe("deny");
  });
});

describe("guard: tool-use envelope and hook contract", () => {
  it("evaluates Bash and PowerShell tools", () => {
    expect(evaluateToolUse({ toolName: "Bash", toolInput: { command: "rm -rf /" } }).decision).toBe(
      "deny",
    );
    expect(
      evaluateToolUse({ toolName: "PowerShell", toolInput: { command: "git reset --hard" } })
        .decision,
    ).toBe("ask");
  });

  it("evaluates write tools by file path", () => {
    expect(evaluateToolUse({ toolName: "Write", toolInput: { file_path: ".env" } }).decision).toBe(
      "ask",
    );
    expect(
      evaluateToolUse({ toolName: "Edit", toolInput: { file_path: "src/a.ts" } }).decision,
    ).toBe("allow");
  });

  it("allows unknown tools and malformed input (never break the session)", () => {
    expect(evaluateToolUse({ toolName: "WebFetch", toolInput: {} }).decision).toBe("allow");
    expect(evaluateToolUse({ toolName: "Bash", toolInput: {} }).decision).toBe("allow");
  });

  it("serializes to the PreToolUse JSON contract", () => {
    const out = toGuardHookOutput({ decision: "deny", reason: "nope" });
    expect(out).toBeDefined();
    const parsed = JSON.parse(out ?? "");
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toBe("nope");
    expect(toGuardHookOutput({ decision: "allow" })).toBeUndefined();
  });

  it("applies custom rules from config", () => {
    const custom = [
      { pattern: String.raw`\bflyctl\s+apps\s+destroy\b`, message: "no", action: "deny" as const },
    ];
    expect(evaluateCommand("flyctl apps destroy prod", { customBashRules: custom }).decision).toBe(
      "deny",
    );
  });
});
