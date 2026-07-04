/**
 * Porting spec: to-codex.py marker discipline → src/convert/markers.ts
 * Idempotency, preservation of human text, and $-sequence safety.
 */
import { describe, expect, it } from "vitest";
import {
  GEN_BEGIN,
  GEN_END,
  extractBetween,
  managedBlock,
  replaceBetween,
  upsertBlock,
} from "../src/convert/markers.js";

const doc = `# My AGENTS.md

Human intro text.

${GEN_BEGIN}
old generated content
${GEN_END}

Human outro text.
`;

describe("markers: replaceBetween", () => {
  it("replaces only the marked region, preserving human text", () => {
    const block = managedBlock(GEN_BEGIN, GEN_END, "new content");
    const { text, replaced } = replaceBetween(doc, GEN_BEGIN, GEN_END, block);
    expect(replaced).toBe(true);
    expect(text).toContain("Human intro text.");
    expect(text).toContain("Human outro text.");
    expect(text).toContain("new content");
    expect(text).not.toContain("old generated content");
  });

  it("is idempotent: double-run = zero diff", () => {
    const block = managedBlock(GEN_BEGIN, GEN_END, "stable content");
    const once = replaceBetween(doc, GEN_BEGIN, GEN_END, block).text;
    const twice = replaceBetween(once, GEN_BEGIN, GEN_END, block).text;
    expect(twice).toBe(once);
  });

  it("returns unchanged when markers are absent", () => {
    const { text, replaced } = replaceBetween("no markers here", GEN_BEGIN, GEN_END, "x");
    expect(replaced).toBe(false);
    expect(text).toBe("no markers here");
  });

  it("does not interpret $-sequences in the replacement (regex-injection safety)", () => {
    const block = managedBlock(GEN_BEGIN, GEN_END, "cost: $100 and capture $& $' $1");
    const { text } = replaceBetween(doc, GEN_BEGIN, GEN_END, block);
    expect(text).toContain("cost: $100 and capture $& $' $1");
  });

  it("handles multi-line generated bodies without greedy overreach", () => {
    const twoBlocks = `${GEN_BEGIN}\na\n${GEN_END}\nmiddle human text\n${GEN_BEGIN}\nb\n${GEN_END}`;
    const block = managedBlock(GEN_BEGIN, GEN_END, "replaced");
    const { text } = replaceBetween(twoBlocks, GEN_BEGIN, GEN_END, block);
    // Only the first region is replaced; the middle text must survive.
    expect(text).toContain("middle human text");
    expect(text).toContain("replaced");
    expect(text).toContain("\nb\n");
  });
});

describe("markers: upsertBlock", () => {
  it("appends with heading when markers are missing", () => {
    const block = managedBlock(GEN_BEGIN, GEN_END, "fresh");
    const { text, replaced } = upsertBlock(
      "# Doc\n\nhuman text\n",
      GEN_BEGIN,
      GEN_END,
      block,
      "## MaaawKit generated guidance",
    );
    expect(replaced).toBe(false);
    expect(text).toContain("## MaaawKit generated guidance");
    expect(text).toContain("fresh");
    expect(text).toContain("human text");
  });

  it("upsert twice equals upsert once (idempotent installs)", () => {
    const block = managedBlock(GEN_BEGIN, GEN_END, "fresh");
    const once = upsertBlock("# Doc\n", GEN_BEGIN, GEN_END, block, "## H").text;
    const twice = upsertBlock(once, GEN_BEGIN, GEN_END, block, "## H").text;
    expect(twice).toBe(once);
  });
});

describe("markers: extractBetween", () => {
  it("returns the body without markers", () => {
    expect(extractBetween(doc, GEN_BEGIN, GEN_END)).toBe("old generated content");
  });

  it("returns null when absent", () => {
    expect(extractBetween("nope", GEN_BEGIN, GEN_END)).toBeNull();
  });
});

describe("markers: property — random human text survives round-trips", () => {
  it("keeps arbitrary surroundings intact across 50 randomized cases", () => {
    // Deterministic PRNG (mulberry32) — reproducible property test.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const alphabet = "abc $&$1{}()[]\\*+?.^|\n#-<>!";
    const randomText = () =>
      Array.from({ length: Math.floor(rand() * 60) }, () =>
        alphabet.charAt(Math.floor(rand() * alphabet.length)),
      ).join("");

    for (let i = 0; i < 50; i++) {
      const before = randomText();
      const after = randomText();
      const body = randomText();
      const document = `${before}\n${GEN_BEGIN}\nold\n${GEN_END}\n${after}`;
      const block = managedBlock(GEN_BEGIN, GEN_END, body);
      const result = replaceBetween(document, GEN_BEGIN, GEN_END, block).text;
      expect(result.startsWith(`${before}\n`)).toBe(true);
      expect(result.endsWith(`\n${after}`)).toBe(true);
      const again = replaceBetween(result, GEN_BEGIN, GEN_END, block).text;
      expect(again).toBe(result);
    }
  });
});
