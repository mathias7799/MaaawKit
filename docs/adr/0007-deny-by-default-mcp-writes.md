# ADR-0007: MCP write-modes are deny-by-default, per-client opt-in

**Accepted, 3.0.** Any MCP client connected to `maaaw mcp serve` can request
bridge jobs; write-capable modes are refused unless the client's declared
name is allow-listed in `.agent/kit.json` → `mcp.writeModeClients`.

Why: a connected client inherits spawn ability — the bridge is a privilege-
escalation vector by construction. Read modes remain broadly available
because they run in place with read-only sandbox flags and pass the same
guard policy. Client-name identity is spoofable by a hostile client, which is
accepted: the gate protects against accidental/default write access, while
hard security still comes from worktree isolation, the guard, and OS/agent
permissions (see SECURITY.md).
