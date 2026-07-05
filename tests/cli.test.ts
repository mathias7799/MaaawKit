import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatCliError } from "../src/cli/main.js";
import { ConfidenceSchema, MemoryTypeSchema } from "../src/schemas/index.js";

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

  it("surfaces a friendly error for a bad memory --type (no as-never escape)", () => {
    // The CLI now parses --type/--confidence through the zod enums; a bad value
    // throws a ZodError that runMain's catch renders via formatCliError.
    const bad = MemoryTypeSchema.safeParse("garbage");
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const message = formatCliError(bad.error);
      expect(message).toContain("Invalid input:");
      expect(message).not.toContain("at ");
    }
    expect(ConfidenceSchema.safeParse("very-high").success).toBe(false);
    // Valid values still parse to the exact enum member.
    expect(MemoryTypeSchema.parse("decision")).toBe("decision");
    expect(ConfidenceSchema.parse("high")).toBe("high");
  });
});
