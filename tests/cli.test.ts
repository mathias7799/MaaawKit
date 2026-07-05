import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatCliError } from "../src/cli/main.js";

describe("CLI error formatting", () => {
  it("prints zod validation errors without stack dumps", () => {
    const parsed = z.object({ type: z.enum(["lesson", "decision"]) }).safeParse({ type: "wat" });
    if (parsed.success) throw new Error("fixture should fail");

    const message = formatCliError(parsed.error);

    expect(message).toContain("Invalid input:");
    expect(message).toContain("type:");
    expect(message).not.toContain("ZodError");
    expect(message).not.toContain("at ");
  });
});
