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
      "handoff_read",
      "handoff_write",
      "memory_learn",
      "memory_promote",
      "memory_recall",
      "rules_sync",
    ]);
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.inputSchema.type, tool.name).toBe("object");
    }
    const bridgeRun = tools.find((t) => t.name === "bridge_run");
    const props = bridgeRun?.inputSchema["properties"] as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(["task", "agent", "mode", "oracle", "execute", "background"]),
    );
  });
});

describe("MCP: memory tools (cross-agent memory goes live)", () => {
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
    execFileSync("git", ["add", "."], { cwd });
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
      arguments: { goal: "continue impl", status: "half done", toAgent: "claude" },
    });
    const read = await client.callTool({ name: "handoff_read", arguments: {} });
    const handoff = JSON.parse(resultText(read));
    expect(handoff.doc.fromAgent).toBe("mcp:codex-mcp");
    expect(handoff.doc.memoryRecords.length).toBeGreaterThan(0);
  });
});
