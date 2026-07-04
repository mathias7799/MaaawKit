/**
 * Drift gate: the committed schemas/*.schema.json files must match what the
 * zod models generate. Regenerate with `npm run schemas` after model changes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPORTED_SCHEMAS, toJsonSchema } from "../src/schemas/index.js";

describe("committed JSON Schemas", () => {
  for (const name of Object.keys(EXPORTED_SCHEMAS) as (keyof typeof EXPORTED_SCHEMAS)[]) {
    it(`schemas/${name}.schema.json matches the zod model`, () => {
      const path = join(import.meta.dirname, "..", "schemas", `${name}.schema.json`);
      const committed = JSON.parse(readFileSync(path, "utf-8"));
      expect(committed, `run \`npm run schemas\` to regenerate ${name}`).toEqual(
        toJsonSchema(name),
      );
    });
  }
});
