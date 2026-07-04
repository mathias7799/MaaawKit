#!/usr/bin/env node
/**
 * Export committed JSON Schemas from the zod models. Run after schema changes:
 *   npm run build && node scripts/export-schemas.mjs
 * CI enforces zero drift between src/schemas and schemas/*.schema.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { EXPORTED_SCHEMAS, toJsonSchema } = await import(
  new URL("../dist/index.js", import.meta.url).href
);

const outDir = join(root, "schemas");
mkdirSync(outDir, { recursive: true });
for (const name of Object.keys(EXPORTED_SCHEMAS)) {
  const schema = toJsonSchema(name);
  const path = join(outDir, `${name}.schema.json`);
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`wrote ${path}`);
}
