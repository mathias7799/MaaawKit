import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
 * Phase 7 spec: MCP server — tool-schema conformance, wrappers over the same
 * engine core, and the security posture: write-mode bridge jobs denied by
 * default, per-client opt-in via kit.json, guard policy identical to CLI/hooks.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { INTEGRATIONS } from "../src/integrations/catalog.js";
import { createMaaawServer } from "../src/mcp/server.js";
import { createRecord } from "../src/memory/store.js";
import { ensureStateDirs, writeJsonFile } from "../src/state/index.js";

let dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "maaaw-mcp-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

async function connect(cwd: string, clientName = "test-client") {
  const server = createMaaawServer({ cwd });
  const client = new Client({ name: clientName, version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

function repo(): string {
  const d = tmp();
  execFileSync("git", ["init", "-q"], { cwd: d });
  ensureStateDirs(d);
  return d;
}

function resultText(result: unknown): string {
  const content = (result as { content?: { type: string; text: string }[] }).content;
  return content?.[0]?.text ?? "";
}

function resourceText(result: unknown): string {
  const contents = (result as { contents?: { text?: string }[] }).contents;
  return contents?.[0]?.text ?? "";
}

describe("MCP: resources for IDE panels", () => {
  it("exposes project status, memory digest, and canonical rules as read-only resources", async () => {
    const cwd = repo();
    writeJsonFile(join(cwd, ".agent", "kit.json"), { guardLevel: "strict" });
    writeFileSync(join(cwd, ".agent", "rules.md"), "# Rules\n- Use MCP resources for panels.");
    createRecord(cwd, {
      type: "lesson",
      title: "Panel context",
      body: "IDE panels should read MCP resources before calling mutating tools.",
      confidence: "high",
    });
    const { client } = await connect(cwd, "cursor");

    const listed = await client.listResources();
    expect(listed.resources.map((r) => r.uri).sort()).toEqual([
      "maaaw://memory/digest",
      "maaaw://project/status",
      "maaaw://prompts/catalog",
      "maaaw://rules/current",
    ]);

    const project = await client.readResource({ uri: "maaaw://project/status" });
    expect(JSON.parse(resourceText(project)).config.guardLevel).toBe("strict");

    const digest = await client.readResource({ uri: "maaaw://memory/digest" });
    expect(resourceText(digest)).toContain("Panel context");

    const rules = await client.readResource({ uri: "maaaw://rules/current" });
    expect(JSON.parse(resourceText(rules)).rulesText).toContain("Use MCP resources");

    const promptCatalog = await client.readResource({ uri: "maaaw://prompts/catalog" });
    expect(JSON.parse(resourceText(promptCatalog)).assets.length).toBeGreaterThan(10);
  });
});

describe("MCP: tool-schema conformance", () => {
  it("exposes the full tool surface with input schemas", async () => {
    const { client } = await connect(repo());
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "bridge_cancel",
      "bridge_result",
      "bridge_run",
      "bridge_status",
      "guard_evaluate",
      "guard_explain",
      "guard_rules",
      "handoff_read",
      "handoff_write",
      "maaaw_capabilities",
      "maaaw_doctor",
      "maaaw_project",
      "memory_digest",
      "memory_learn",
      "memory_promote",
      "memory_recall",
      "prompt_catalog",
      "prompt_read",
      "rules_read",
      "rules_sync",
      "rules_validate",
    ]);
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.inputSchema.type, tool.name).toBe("object");
    }
    const bridgeRun = tools.find((t) => t.name === "bridge_run");
    const props = bridgeRun?.inputSchema["properties"] as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining([
        "task",
        "agent",
        "mode",
        "oracle",
        "promptAssetId",
        "execute",
        "background",
      ]),
    );
  });
});

describe("MCP: prompt orchestration surface", () => {
  it("lists reads and composes interchangeable prompt assets", async () => {
    const { client } = await connect(repo());
    const listed = await client.callTool({ name: "prompt_catalog", arguments: { kind: "agent" } });
    const assets = JSON.parse(resultText(listed)).assets;
    const reviewer = assets.find((asset: { id: string }) =>
      asset.id.endsWith(".agent.code-reviewer"),
    );
    expect(reviewer?.id).toBeTruthy();

    const read = await client.callTool({
      name: "prompt_read",
      arguments: { id: reviewer.id },
    });
    expect(JSON.parse(resultText(read)).content).toContain("You are a senior reviewer");

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((p) => p.name)).toContain("maaaw_orchestrate");
    const prompt = await client.getPrompt({
      name: "maaaw_orchestrate",
      arguments: { assetId: reviewer.id, task: "review auth changes", targetAgent: "codex" },
    });
    const content = prompt.messages[0]?.content;
    expect(content?.type).toBe("text");
    const promptText = content?.type === "text" ? content.text : "";
    expect(promptText).toContain(reviewer.id);
    expect(promptText).toContain("review auth changes");
  });
});

describe("MCP: ADE/IDE discovery tools", () => {
  it("reports capabilities, project state, and doctor checks as structured JSON", async () => {
    const cwd = repo();
    writeJsonFile(join(cwd, ".agent", "kit.json"), {
      guardLevel: "strict",
      mcp: { writeModeClients: ["ide-client"] },
    });
    const { client } = await connect(cwd, "ide-client");

    const capabilities = JSON.parse(
      resultText(await client.callTool({ name: "maaaw_capabilities", arguments: {} })),
    );
    expect(capabilities.version).toBeTruthy();
    expect(capabilities.client).toEqual({ name: "ide-client", writeModeAllowed: true });
    expect(capabilities.surfaces).toMatchObject({ mcp: true, cli: true, bridge: true });
    expect(capabilities.environments.map((e: { id: string }) => e.id)).toEqual(
      INTEGRATIONS.map((i) => i.id),
    );
    expect(capabilities.environments.find((e: { id: string }) => e.id === "cursor")).toMatchObject({
      mcp: true,
      rulesArtifacts: true,
    });

    const project = JSON.parse(
      resultText(await client.callTool({ name: "maaaw_project", arguments: {} })),
    );
    expect(project.cwd).toBe(cwd);
    expect(project.git.insideWorkTree).toBe(true);
    expect(project.state.initialized).toBe(true);
    expect(project.config.guardLevel).toBe("strict");
    expect(project.client.writeModeAllowed).toBe(true);

    const doctor = JSON.parse(
      resultText(await client.callTool({ name: "maaaw_doctor", arguments: {} })),
    );
    expect(doctor.healthy).toBe(true);
    expect(doctor.checks.some((c: { name: string }) => c.name === "node")).toBe(true);
  });
});

describe("MCP: memory tools (cross-agent memory goes live)", () => {
  it("memory_digest returns the context digest without requiring host-specific hooks", async () => {
    const cwd = repo();
    createRecord(cwd, {
      type: "repo-fact",
      title: "API tests use fake timers",
      body: "Use fake timers for retry tests so IDE agents avoid slow sleeps.",
      paths: ["src/api/**"],
      confidence: "high",
    });
    const { client } = await connect(cwd, "cursor");

    const digest = JSON.parse(
      resultText(
        await client.callTool({
          name: "memory_digest",
          arguments: { changedFiles: ["src/api/retry.ts"], tokenBudget: 200 },
        }),
      ),
    );

    expect(digest.content).toContain("API tests use fake timers");
    expect(digest.included.length).toBe(1);
    expect(digest.tokens).toBeGreaterThan(0);
  });

  it("memory_learn → memory_recall round-trip with hit counting", async () => {
    const cwd = repo();
    const { client } = await connect(cwd);
    const learned = await client.callTool({
      name: "memory_learn",
      arguments: {
        title: "Postgres tests need docker compose",
        body: "The test database runs in compose; local pg is not used.",
        type: "repo-fact",
        tags: ["testing"],
      },
    });
    const record = JSON.parse(resultText(learned));
    expect(record.id).toMatch(/^mem_/);
    expect(record.source).toBe("mcp:test-client");

    const recalled = await client.callTool({
      name: "memory_recall",
      arguments: { query: "docker compose postgres" },
    });
    const results = JSON.parse(resultText(recalled));
    expect(results[0].id).toBe(record.id);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("memory_promote flows into rules.md (and errors cleanly on bad ids)", async () => {
    const cwd = repo();
    const record = createRecord(cwd, { type: "lesson", title: "promote me", body: "important" });
    const { client } = await connect(cwd);
    const promoted = await client.callTool({
      name: "memory_promote",
      arguments: { id: record.id },
    });
    expect(JSON.parse(resultText(promoted)).status).toBe("promoted");
    expect(readFileSync(join(cwd, ".agent", "rules.md"), "utf-8")).toContain("promote me");

    const missing = await client.callTool({
      name: "memory_promote",
      arguments: { id: "mem_ffffff" },
    });
    expect(missing.isError).toBe(true);
  });
});

describe("MCP: guard preflight tools", () => {
  it("evaluates and explains commands and protected writes with repo guard config", async () => {
    const cwd = repo();
    writeJsonFile(join(cwd, ".agent", "kit.json"), { guardLevel: "strict" });
    const { client } = await connect(cwd, "ide-client");

    const destructive = JSON.parse(
      resultText(
        await client.callTool({
          name: "guard_evaluate",
          arguments: { toolName: "Bash", command: "git reset --hard" },
        }),
      ),
    );
    expect(destructive.decision).toBe("deny");
    expect(destructive.guardLevel).toBe("strict");

    const protectedWrite = JSON.parse(
      resultText(
        await client.callTool({
          name: "guard_explain",
          arguments: { toolName: "Write", path: ".env" },
        }),
      ),
    );
    expect(protectedWrite.decision).toBe("deny");
    expect(protectedWrite.guidance).toContain("Do not proceed");

    const rules = JSON.parse(
      resultText(await client.callTool({ name: "guard_rules", arguments: {} })),
    );
    expect(rules.guardLevel).toBe("strict");
    expect(rules.bashRules.length).toBeGreaterThan(0);
    expect(rules.protectedWriteRules.length).toBeGreaterThan(0);
  });
});

describe("MCP: bridge tools and the write-mode gate", () => {
  function fakeAdapter(cwd: string): void {
    const FAKE = join(import.meta.dirname, "fixtures", "fake-clis", "fake-agent.mjs");
    writeJsonFile(join(cwd, ".agent", "bridge", "adapters.json"), {
      fake: {
        bin: process.execPath,
        baseArgs: [FAKE],
        promptVia: "stdin",
        outputVia: "file",
        readArgs: ["exec", "--sandbox", "read-only", "-o", "{outputFile}", "-"],
        writeArgs: ["exec", "--sandbox", "workspace-write", "-o", "{outputFile}", "-"],
        verifiedAgainst: "fake fixture",
      },
    });
  }

  it("write-mode is DENIED by default from MCP", async () => {
    const cwd = repo();
    fakeAdapter(cwd);
    const { client } = await connect(cwd);
    const result = await client.callTool({
      name: "bridge_run",
      arguments: { task: "edit things", agent: "fake", mode: "implementation-worktree" },
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("denied by default");
    expect(resultText(result)).toContain("test-client");
  });

  it("write-mode allowed after per-client opt-in in kit.json", async () => {
    const cwd = repo();
    fakeAdapter(cwd);
    execFileSync("git", ["config", "user.email", "t@t"], { cwd });
    execFileSync("git", ["config", "user.name", "t"], { cwd });
    writeFileSync(join(cwd, "f.txt"), "x");
    // Only f.txt — a git-tracked adapters.json is refused by the trust gate.
    execFileSync("git", ["add", "f.txt"], { cwd });
    execFileSync("git", ["commit", "-qm", "init"], { cwd });
    writeJsonFile(join(cwd, ".agent", "kit.json"), { mcp: { writeModeClients: ["test-client"] } });

    const { client } = await connect(cwd);
    const result = await client.callTool({
      name: "bridge_run",
      arguments: { task: "prepare an edit", agent: "fake", mode: "test-fix" },
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(resultText(result));
    expect(parsed.job.status).toBe("prepared");
    expect(parsed.job.worktree).toBeTruthy();
    dirs.push(parsed.job.worktree);
    // opt-in is per client name — a different client is still denied
    const other = await connect(cwd, "other-client");
    const denied = await other.client.callTool({
      name: "bridge_run",
      arguments: { task: "edit", agent: "fake", mode: "test-fix" },
    });
    expect(denied.isError).toBe(true);
  });

  it("guard policy is identical through MCP (destructive task refused)", async () => {
    const cwd = repo();
    fakeAdapter(cwd);
    const { client } = await connect(cwd);
    const result = await client.callTool({
      name: "bridge_run",
      arguments: { task: "rm -rf /", agent: "fake", mode: "review-only", execute: true },
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("refused");
  });

  it("read-mode run executes end-to-end and bridge_status/result work", async () => {
    const cwd = repo();
    fakeAdapter(cwd);
    const { client } = await connect(cwd);
    const run = await client.callTool({
      name: "bridge_run",
      arguments: { task: "review the code", agent: "fake", mode: "review-only", execute: true },
    });
    const job = JSON.parse(resultText(run));
    expect(job.status).toBe("done");

    const status = await client.callTool({ name: "bridge_status", arguments: { id: job.id } });
    expect(JSON.parse(resultText(status)).status).toBe("done");

    const result = await client.callTool({ name: "bridge_result", arguments: { id: job.id } });
    expect(JSON.parse(resultText(result)).result).toContain("# Worker Result");
  });
});

describe("MCP: rules_sync and handoff round-trip (the bidirectional demo)", () => {
  it("rules_read and rules_validate expose canonical rules and drift state", async () => {
    const cwd = repo();
    writeFileSync(
      join(cwd, ".agent", "rules.md"),
      "# Project rules\n- Prefer MCP-first integration.",
    );
    writeFileSync(join(cwd, "CLAUDE.md"), "# c\n");
    const { client } = await connect(cwd, "vscode");

    const rules = JSON.parse(
      resultText(await client.callTool({ name: "rules_read", arguments: {} })),
    );
    expect(rules.rulesText).toContain("Prefer MCP-first integration");

    const before = JSON.parse(
      resultText(await client.callTool({ name: "rules_validate", arguments: {} })),
    );
    expect(before.ok).toBe(false);
    expect(before.stale.some((d: { relPath: string }) => d.relPath === "CLAUDE.md")).toBe(true);

    await client.callTool({ name: "rules_sync", arguments: {} });
    const after = JSON.parse(
      resultText(await client.callTool({ name: "rules_validate", arguments: {} })),
    );
    expect(after.ok).toBe(true);
  });

  it("a second agent can write a handoff and sync rules through MCP", async () => {
    const cwd = repo();
    createRecord(cwd, { type: "lesson", title: "shared lesson", body: "known by all agents" });
    writeFileSync(join(cwd, "CLAUDE.md"), "# c\n");
    const { client } = await connect(cwd, "codex-mcp");

    const sync = await client.callTool({ name: "rules_sync", arguments: {} });
    const { actions } = JSON.parse(resultText(sync));
    expect(actions.some((a: { tool: string }) => a.tool === "claude")).toBe(true);
    expect(readFileSync(join(cwd, "CLAUDE.md"), "utf-8")).toContain("shared lesson");

    await client.callTool({
      name: "handoff_write",
      arguments: {
        goal: "continue impl",
        status: "half done",
        toAgent: "claude",
        promptAssetId: "maaaw-kit.agent.code-reviewer",
      },
    });
    const read = await client.callTool({ name: "handoff_read", arguments: {} });
    const handoff = JSON.parse(resultText(read));
    expect(handoff.doc.fromAgent).toBe("mcp:codex-mcp");
    expect(handoff.doc.promptAssetId).toBe("maaaw-kit.agent.code-reviewer");
    expect(handoff.doc.memoryRecords.length).toBeGreaterThan(0);
  });
});
