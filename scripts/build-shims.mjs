#!/usr/bin/env node
/**
 * Generate the committed shims from shims/templates/ + the canonical guard
 * rule table (built engine). Output goes to BOTH:
 *   - shims/            (shipped in the npm package)
 *   - plugins/maaaw-kit/hooks/   (referenced by the plugin's hooks.json)
 * Run after rule/template changes: npm run shims
 * A drift test regenerates from src and fails CI on mismatch.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { generateShim } = await import(new URL("../dist/hooks/index.js", import.meta.url).href);

const templatesDir = join(root, "shims", "templates");
const targets = [join(root, "shims"), join(root, "plugins", "maaaw-kit", "hooks")];
for (const name of readdirSync(templatesDir).filter((f) => f.endsWith(".mjs"))) {
  const content = generateShim(readFileSync(join(templatesDir, name), "utf-8"));
  for (const dir of targets) {
    const out = join(dir, name);
    writeFileSync(out, content);
    console.log(`wrote ${out}`);
  }
}
