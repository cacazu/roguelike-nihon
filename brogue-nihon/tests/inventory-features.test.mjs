import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, copyFileSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { generateDataInventory, validateDataSnapshot, maskC, repositoryRoot } from "./inventory-features.mjs";

test("CE 1.15.1 definitions, table rows and variants match the initial data snapshot", () => {
  const inventory = generateDataInventory({ gitMetadata: false });
  assert.deepEqual(validateDataSnapshot(inventory), { groups: 37, definitions: 1120, tables: 48, variants: 3 });
  assert.deepEqual(Object.values(inventory.variants).map(v => v.constants.variantName.expression),
    ['"brogue"', '"rapidBrogue"', '"bulletBrogue"']);
  assert.equal(inventory.tables.filter(t => t.base_table === "blueprintCatalog")
    .filter(t => t.rows[48].first_string.includes("// DISABLED.")).length, 3);
  assert.equal(inventory.runtime_results.length, 0);
  assert.equal(inventory.data_acceptance.length, 6);
  assert.equal(inventory.static_findings.length, 4);
});

test("acceptance references resolve to function definitions rather than conditional calls", () => {
  const inventory = generateDataInventory({ gitMetadata: false });
  for (const group of inventory.data_acceptance.filter(g => g.id !== "data.feats-variants")) {
    for (const ref of group.sources) {
      const line = readFileSync(path.join(repositoryRoot, "brogue-nihon", ref.file), "utf8").split(/\r?\n/)[ref.line - 1];
      assert.match(line, new RegExp(`^(?:static\\s+)?(?:void|boolean|short|int|long|fixpt)\\s+${ref.symbol}\\s*\\(`));
    }
  }
});

test("C lexer ignores braces in comments/literals and preserves source offsets", () => {
  const text = '// { ignored\n{"https://host/{/*", \'{\', /* }\n ignored */ {1}}';
  const masked = maskC(text, true);
  assert.equal(masked.length, text.length);
  assert.equal(masked.split("\n").length, text.split("\n").length);
  assert.equal([...masked].filter(c => c === "{").length, 2);
  assert.equal([...masked].filter(c => c === "}").length, 2);
  assert.match(maskC(text), /"https:\/\/host\/\{\/\*"/);
});

test("source-only copy regenerates the snapshot without Git, .local inputs or build artifacts", () => {
  const base = path.join(repositoryRoot, ".local/feature-verification");
  mkdirSync(base, { recursive: true });
  const isolated = mkdtempSync(path.join(base, "inventory-source-"));
  const verified = realpathSync(isolated);
  assert.equal(verified, path.resolve(isolated));
  assert(verified.startsWith(realpathSync(repositoryRoot) + path.sep));
  assert(path.basename(verified).startsWith("inventory-source-"));
  try {
    const reference = generateDataInventory({ gitMetadata: false });
    for (const { file } of reference.reference.sources) {
      const destination = path.join(isolated, "brogue-nihon", file);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(path.join(repositoryRoot, "brogue-nihon", file), destination);
    }
    const inventory = generateDataInventory({ root: isolated, gitMetadata: false });
    assert.deepEqual(validateDataSnapshot(inventory), { groups: 37, definitions: 1120, tables: 48, variants: 3 });
    assert.deepEqual(inventory, reference);
  } finally {
    // Only this uniquely created, resolved directory inside the workspace is removed.
    assert.equal(realpathSync(isolated), verified);
    rmSync(verified, { recursive: true, force: true });
  }
});
