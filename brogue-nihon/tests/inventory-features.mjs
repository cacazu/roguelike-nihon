// Source-derived CE 1.15.1 data inventory. It reads no .local inventory or build output.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, "../..");
export const enumNames = [
  "itemCategory", "keyKind", "foodKind", "potionKind", "weaponKind", "weaponEnchants",
  "armorKind", "armorEnchants", "wandKind", "staffKind", "boltType", "ringKind",
  "charmKind", "scrollKind", "monsterTypes", "statusEffects", "monsterBehaviorFlags",
  "monsterAbilityFlags", "monsterBookkeepingFlags", "creatureStates", "creatureModes",
  "featTypes", "tileType", "dungeonFeatureTypes", "dungeonProfileTypes", "dungeonLayers",
  "terrainFlagCatalog", "terrainMechanicalFlagCatalog", "machineTypes", "DFFlags",
  "hordeFlags", "blueprintFlags", "machineFeatureFlags", "itemFlags", "tileFlags",
  "boltEffects", "boltFlags",
];
const flagGroups = new Set([
  "itemCategory", "monsterBehaviorFlags", "monsterAbilityFlags", "monsterBookkeepingFlags",
  "terrainFlagCatalog", "terrainMechanicalFlagCatalog", "DFFlags", "hordeFlags",
  "blueprintFlags", "machineFeatureFlags", "itemFlags", "tileFlags", "boltFlags",
]);
const tableNames = [
  "tileCatalog", "dungeonFeatureCatalog", "dungeonProfileCatalog", "monsterCatalog",
  "mutationCatalog", "monsterClassCatalog", "keyTable", "foodTable", "weaponTable",
  "armorTable", "staffTable", "ringTable", "monsterBehaviorCatalog", "monsterAbilityCatalog",
  "statusEffectCatalog", "boltCatalog", "featTable", "autoGeneratorCatalog", "blueprintCatalog",
  "meteredItemsGenerationTable", "potionTable", "scrollTable", "wandTable", "charmTable",
  "charmEffectTable", "hordeCatalog",
];
const enumForTable = {
  tileCatalog: "tileType", dungeonFeatureCatalog: "dungeonFeatureTypes",
  dungeonProfileCatalog: "dungeonProfileTypes", monsterCatalog: "monsterTypes", keyTable: "keyKind",
  foodTable: "foodKind", weaponTable: "weaponKind", armorTable: "armorKind", staffTable: "staffKind",
  ringTable: "ringKind", statusEffectCatalog: "statusEffects", boltCatalog: "boltType",
  featTable: "featTypes", potionTable: "potionKind", scrollTable: "scrollKind", wandTable: "wandKind",
  charmTable: "charmKind", charmEffectTable: "charmKind", blueprintCatalog: "machineTypes",
};
const variants = [
  ["brogue", "Brogue", "BROGUE", "CE 1.15.1"],
  ["rapid_brogue", "RapidBrogue", "RAPID_BROGUE", "RB 1.7.1"],
  ["bullet_brogue", "BulletBrogue", "BULLET_BROGUE", "BB 1.2.1"],
];
const lf = value => value.replace(/\r\n/g, "\n");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const lineAt = (text, offset) => text.slice(0, offset).split("\n").length;
const sourceRef = (file, line, symbol) => ({ file, line, ...(symbol ? { symbol } : {}) });

// Preserve offsets and line endings. Literal tokens protect //, /* and braces
// inside C strings; character literals are also excluded from brace counting.
export function maskC(text, literals = false) {
  return text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
    token => token.startsWith("/") || literals ? token.replace(/[^\n]/g, " ") : token);
}

// This is a restricted integer-expression parser, not eval of source text.
// The selected enums use ordinals, prior symbols, Fl(n), and bitwise masks.
function enumValue(expression, known) {
  const tokens = expression.match(/0[xX][0-9a-fA-F]+|\d+|[A-Za-z_]\w*|<<|>>|[()+\-~|&^*,/]/g) ?? [];
  if (tokens.join("") !== expression.replace(/\s/g, "")) throw new Error(`Unsupported enum expression: ${expression}`);
  let cursor = 0;
  const precedence = { "|": 1, "^": 2, "&": 3, "<<": 4, ">>": 4, "+": 5, "-": 5, "*": 6, "/": 6 };
  function atom() {
    const token = tokens[cursor++];
    if (token === "(" ) { const n = parse(0); if (tokens[cursor++] !== ")") throw new Error("Unclosed enum expression"); return n; }
    if (token === "-" || token === "+" || token === "~") { const n = atom(); return token === "-" ? -n : token === "~" ? ~n : n; }
    if (token === "Fl") {
      if (tokens[cursor++] !== "(") throw new Error("Invalid Fl expression");
      const n = parse(0);
      if (tokens[cursor++] !== ")" || n < 0 || n > 30) throw new Error("Unsupported Fl bit");
      return 2 ** n;
    }
    if (/^(?:\d+|0[xX][0-9a-fA-F]+)$/.test(token ?? "")) return Number(token);
    if (known.has(token)) return known.get(token);
    throw new Error(`Unknown enum symbol: ${token}`);
  }
  function parse(minimum) {
    let left = atom();
    while (precedence[tokens[cursor]] >= minimum) {
      const op = tokens[cursor++], right = parse(precedence[op] + 1);
      left = op === "|" ? left | right : op === "&" ? left & right : op === "^" ? left ^ right
        : op === "<<" ? left << right : op === ">>" ? left >> right : op === "+" ? left + right
          : op === "-" ? left - right : op === "*" ? left * right : Math.trunc(left / right);
    }
    return left;
  }
  const value = parse(0);
  if (cursor !== tokens.length) throw new Error(`Unused enum expression tokens: ${expression}`);
  return value;
}

function parseDefinitions(header) {
  const masked = maskC(header), definitions = {};
  for (const name of enumNames) {
    const match = new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\};`).exec(masked);
    if (!match) throw new Error(`Missing enum ${name}`);
    const bodyStart = match.index + match[0].indexOf("{") + 1, known = new Map(), entries = [];
    let previous = -1;
    for (const piece of match[1].matchAll(/([^,]+)(?:,|$)/g)) {
      const entry = /^\s*([A-Z][A-Z0-9_]*)(?:\s*=\s*([\s\S]*?))?\s*$/.exec(piece[1]);
      if (!entry) { if (piece[1].trim()) throw new Error(`Unsupported ${name} member`); continue; }
      const symbol = entry[1], expression = entry[2]?.trim().replace(/\s+/g, " ");
      const classification = symbol.startsWith("NUMBER_") ? "count-boundary"
        : flagGroups.has(name) && expression && !expression.includes("Fl(") ? "mask" : "primitive";
      const value = expression === undefined ? previous + 1 : enumValue(expression, known);
      previous = value; known.set(symbol, value);
      entries.push({ symbol, line: lineAt(header, bodyStart + piece.index + piece[1].indexOf(symbol)),
        classification, ...(expression === undefined ? {} : { expression }), value });
    }
    definitions[name] = { source: sourceRef("src/brogue/Rogue.h", lineAt(header, match.index), name),
      definition_count: entries.length, primitive_count: entries.filter(e => e.classification === "primitive").length,
      mask_count: entries.filter(e => e.classification === "mask").length,
      count_boundary_count: entries.filter(e => e.classification === "count-boundary").length, entries };
  }
  Object.assign(definitions.dungeonLayers, { notes: "NO_LAYER=-1 is a no-layer marker; actual terrain layers are DUNGEON/LIQUID/GAS/SURFACE (4), with NUMBER_TERRAIN_LAYERS=4." });
  Object.assign(definitions.boltType, { notes: "BOLT_NONE=0 is the no-bolt placeholder; 29 remaining named bolt indexes share a 30-row catalog." });
  Object.assign(definitions.tileType, { notes: "NOTHING=0 is an explicit empty terrain slot. 215 valid indexed rows include that slot." });
  Object.assign(definitions.dungeonFeatureTypes, { notes: "Named DF values start at1 and end218; catalog index0 is reserved empty, so219 rows are valid." });
  Object.assign(definitions.machineTypes, { notes: "Named machine values1..72. The final value MT_REWARD_HEAVY_OR_RUNIC_WEAPON exists only in Bullet blueprint data; base/Rapid arrays stop at71 plus reserved0." });
  return definitions;
}

function parseTables(read, definitions) {
  const files = ["src/brogue/Globals.c", "src/variants/GlobalsBrogue.c", "src/variants/GlobalsBulletBrogue.c", "src/variants/GlobalsRapidBrogue.c"];
  const tables = [];
  for (const file of files) {
    const original = read(file), masked = maskC(original, true);
    for (const base of tableNames) {
      const match = new RegExp(`\\b(${base}(?:_\\w+)?)\\s*\\[([^\\]]*)\\]\\s*=\\s*\\{`).exec(masked);
      if (!match) continue;
      const rows = []; let depth = 1, start;
      for (let i = match.index + match[0].length; depth; i++) {
        if (i >= masked.length) throw new Error(`Unclosed table ${match[1]}`);
        if (masked[i] === "{") { if (depth === 1) start = i; depth++; }
        else if (masked[i] === "}") {
          depth--;
          if (depth !== 1 || start === undefined) continue;
          const row = { index: rows.length, line: lineAt(original, start) };
          const first = /"((?:\\[\s\S]|[^"\\])*)"/.exec(maskC(original.slice(start, i + 1)));
          if (first) row.first_string = first[1];
          if (enumForTable[base]) {
            row.symbol = definitions[enumForTable[base]].entries.find(e => e.value === rows.length && e.classification === "primitive")?.symbol
              ?? (rows.length === 0 ? "RESERVED_ZERO" : null);
          }
          rows.push(row); start = undefined;
        }
      }
      const declared = match[2].trim();
      const capacity = /^\d+$/.test(declared) ? Number(declared)
        : Object.values(definitions).flatMap(d => d.entries).find(e => e.symbol === declared)?.value;
      const record = { source: sourceRef(file, lineAt(original, match.index), match[1]), base_table: base,
        declared_size: declared, initialized_rows: rows.length, rows };
      if (capacity !== undefined) Object.assign(record, { declared_capacity: capacity, zero_initialized_tail: Math.max(0, capacity - rows.length) });
      if (base === "blueprintCatalog" || base === "dungeonFeatureCatalog") record.reserved_zero_rows = 1;
      if (enumForTable[base]) record.enum = enumForTable[base];
      tables.push(record);
    }
  }
  return tables;
}

function parseVariants(read, tables) {
  const result = {};
  for (const [key, suffix, prefix, version] of variants) {
    const file = `src/variants/Globals${suffix}.c`, text = read(file), masked = maskC(text);
    const match = /const gameConstants\s+(\w+)\s*=\s*\{([\s\S]*?)\};/.exec(masked);
    if (!match) throw new Error(`Missing game constants: ${file}`);
    const bodyStart = match.index + match[0].indexOf("{") + 1, constants = {};
    for (const property of match[2].matchAll(/\.(\w+)\s*=\s*([^,]+),/g)) {
      constants[property[1]] = { expression: property[2].trim().replace(/\s+/g, " "),
        line: lineAt(text, bodyStart + property.index) };
    }
    const macro = name => {
      const entry = new RegExp(`^#define\\s+${name}\\s+([^\\n]+)`, "m").exec(masked);
      if (!entry) throw new Error(`Missing macro ${name}`);
      return entry[1].trim();
    };
    result[key] = { source: sourceRef(file, lineAt(text, match.index), match[1]), version,
      dungeon_version: macro(`${prefix}_DUNGEON_VERSION_STRING`).replace(/^"|"$/g, ""),
      amulet_level: Number(macro("AMULET_LEVEL")), deepest_level: Number(macro("DEEPEST_LEVEL")), constants,
      table_counts: Object.fromEntries(tables.filter(t => t.source.file === file).map(t => [t.base_table, t.initialized_rows])),
      conditional_blueprint: { symbol: "MT_REWARD_HEAVY_OR_RUNIC_WEAPON", available: key === "bullet_brogue" } };
  }
  return result;
}

function acceptance(read) {
  const ref = (name, symbol) => {
    const file = `src/brogue/${name}.c`, text = read(file);
    const match = new RegExp(`^[ \\t]*(?:static\\s+)?(?:void|boolean|short|int|long|fixpt)\\s+${symbol}\\s*\\([^;]*\\)\\s*\\{`, "m").exec(maskC(text));
    if (!match) throw new Error(`Missing acceptance function ${file}:${symbol}`);
    return sourceRef(file, lineAt(text, match.index), symbol);
  };
  const groups = [
    ["data.items-kinds", ["itemCategory", "keyKind", "foodKind", "potionKind", "weaponKind", "armorKind", "wandKind", "staffKind", "ringKind", "charmKind", "scrollKind"],
      [["Items", "apply"], ["Items", "drinkPotion"], ["Items", "readScroll"], ["Items", "useStaffOrWand"], ["Items", "useCharm"], ["Items", "equip"], ["Items", "pickUpItemAt"]],
      ["generate and expose each valid category/kind", "inspect before/after identification", "apply/equip and execute follow-up choice, target, confirmation and cancel", "compare charges, quantity, cooldown, flags, turn and subsequent action to same-version native"],
      "Every valid kind dispatches to its original effect. Identification remains hidden until the C owner exposes it. Kind generation and description alone do not establish effect coverage."],
    ["data.runic", ["weaponEnchants", "armorEnchants"], [["Combat", "magicWeaponHit"], ["Combat", "applyArmorRunicEffect"]],
      ["trigger each runic with original RNG", "test applicable targets, immunity and identification", "continue to the next turn"],
      "All 10 weapon and 11 armor runics match native effect, chance, identification and target restrictions; count-boundary aliases are not separate effects."],
    ["data.terrain", ["tileType", "terrainFlagCatalog", "terrainMechanicalFlagCatalog", "dungeonFeatureTypes", "DFFlags", "dungeonLayers", "dungeonProfileTypes", "machineTypes", "machineFeatureFlags", "blueprintFlags"],
      [["Time", "applyInstantTileEffectsToCreature"], ["Time", "applyGradualTileEffectsToCreature"], ["Time", "updateEnvironment"], ["Time", "activateMachine"], ["Time", "promoteTile"], ["Time", "exposeTileToFire"], ["Time", "exposeTileToElectricity"], ["Architect", "buildAMachine"]],
      ["exercise collision, visibility, discovered/undiscovered traps", "advance fire, gas, liquid, ice and lichen through environment turns", "trigger keys, levers, pressure plates, altars, wires and circuit breakers", "compare identical setup, seed and consumed input with native"],
      "Layer, flag, DF and machine transitions follow C rules without revealing undiscovered traps or dormant entities. NOTHING, DF0 and blueprint0 retain reserved semantics."],
    ["data.status", ["statusEffects"], [["Time", "decrementPlayerStatus"], ["Time", "checkNutrition"], ["Monsters", "decrementMonsterStatus"], ["Monsters", "negateCreatureStatusEffects"]],
      ["induce, tick and clear each applicable player/monster status", "test immunity, negation and expiration", "compare HUD, saved state and next command"],
      "All 27 statuses retain native timing, immunity and negation. Empty descriptive labels are not evidence of absent engine behavior."],
    ["data.monsters-ai", ["monsterTypes", "creatureStates", "creatureModes", "monsterBehaviorFlags", "monsterAbilityFlags", "monsterBookkeepingFlags", "hordeFlags", "boltType", "boltEffects", "boltFlags"],
      [["Monsters", "updateMonsterState"], ["Monsters", "monstersTurn"], ["Monsters", "monstUseMagic"], ["Monsters", "moveAlly"], ["Monsters", "monsterSummons"], ["Monsters", "mutateMonster"], ["Monsters", "resurrectAlly"], ["Monsters", "monsterIsHidden"], ["Combat", "attack"]],
      ["initialize all 67 non-player kinds through original constructors", "exercise five creature states and both modes", "trigger compatible behavior, ability, horde and eight mutation cases", "test captive rescue, alliance, absorption, resurrection, stair pursuit and dormancy", "compare hidden/public rendering and deterministic subsequent native turns"],
      "AI remains C-owned. Composite masks/bookkeeping states are separate from creature kinds. Description and spawn coverage are not behavioral coverage."],
  ];
  return groups.map(([id, domains, sources, operations, expected]) => ({ id, domains,
    sources: sources.map(([file, symbol]) => ref(file, symbol)), operations, expected, runtime_status: "not-run-by-data-inventory" }));
}

export function generateDataInventory({ root = repositoryRoot, gitMetadata = true } = {}) {
  const game = path.join(root, "brogue-nihon"), cache = new Map();
  const read = file => {
    if (!cache.has(file)) cache.set(file, lf(readFileSync(path.join(game, file), "utf8")));
    return cache.get(file);
  };
  const definitions = parseDefinitions(read("src/brogue/Rogue.h")), tables = parseTables(read, definitions);
  const variantData = parseVariants(read, tables), dataAcceptance = acceptance(read);
  dataAcceptance.push({ id: "data.feats-variants", domains: ["featTypes"],
    sources: tables.filter(t => t.base_table === "featTable").map(t => t.source),
    operations: ["exercise gain/invalidation of all eight feats", "repeat relevant generation, effects and ending checks in each variant", "check variant-specific blueprint and depth limits"],
    expected: "Variant tables and gameConstants are authoritative. Display, recording and dungeon versions are distinct; compare upstream feat text and predicate independently.",
    runtime_status: "not-run-by-data-inventory" });
  let head = null;
  if (gitMetadata) { try { head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch {} }
  const sourceFiles = ["Architect", "Combat", "Globals", "GlobalsBase", "Items", "Monsters", "Rogue", "Time"]
    .map(name => `src/brogue/${name}.${name === "Rogue" ? "h" : "c"}`)
    .concat(variants.map(([, suffix]) => `src/variants/Globals${suffix}.c`)).sort();
  const sources = sourceFiles.map(file => {
    const bytes = Buffer.from(read(file), "utf8");
    let matches = null;
    if (head) {
      const original = execFileSync("git", ["show", `${head}:brogue-nihon/${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
      matches = Buffer.from(lf(original.toString("utf8")), "utf8").equals(bytes);
    }
    return { file, sha256_lf: sha(bytes), matches_reference_head: matches };
  });
  const staticFindings = [
    { id: "count-reserved-and-alias", kind: "counting-contract", detail: "Monster kinds=68 including MK_YOU (67 non-player); tile slots=215 including NOTHING; DF named values=218 at indexes1..218 plus reserved0 yields219 rows. Count boundaries and masks are not extra kinds." },
    { id: "partial-description-initializers", kind: "source-observation", detail: "monsterBehaviorCatalog[32] initializes29 rows for31 primitive flags; monsterAbilityCatalog[32] initializes18 for19 flags; statusEffectCatalog27 initializes26, leaving STATUS_AGGRAVATING zero-initialized. Description counts do not establish absent behavior." },
    { id: "variant-machine-capacity", kind: "conditional-feature", detail: "machineTypes spans1..72; Brogue/Rapid blueprint arrays have72 rows (reserved0 plus71), Bullet73 and MT_REWARD_HEAVY_OR_RUNIC_WEAPON." },
    { id: "bullet-companion-text-threshold", kind: "upstream-text-predicate-difference", sources: [
      sourceRef("src/variants/GlobalsBulletBrogue.c", tables.find(t => t.source.symbol === "featTable_BulletBrogue").rows[2].line, "featTable_BulletBrogue"),
      sourceRef("src/variants/GlobalsBulletBrogue.c", variantData.bullet_brogue.constants.companionFeatRequiredXP.line, "bulletBrogueGameConst.companionFeatRequiredXP"),
    ], detail: "Bullet Companion text says Explore 3 new depths; requiredXP=1600 (source comment about2depths). Preserve and compare text/predicate independently; no product correction is made." },
  ];
  return { schema_version: 1, reference: { repository_head: head, upstream_release: "BrogueCE v1.15.1", source_eol: "LF", sources },
    scope: { kind: "static-source-data-inventory", runtime_verification: "not performed by this generator; runtime evidence is reported separately",
      counting: "primitive excludes count-boundary aliases and masks; reserved slots are explicit",
      regeneration: "tests/inventory-features.mjs reads only C/H sources; it masks comments/literals without shifting offsets and parses named enums, top-level initializer rows and scalar variant constants.",
      parser_differences_from_initial_snapshot: [
        "The three variantName.expression values now retain their complete C string literals; the initial inline parser incorrectly retained only the closing quote.",
        "The three blueprint row48 first_string labels now retain // inside their C string literals; the initial inline label extraction incorrectly treated it as a comment.",
        "Acceptance source references require a function definition signature; conditional call sites cannot be mistaken for definitions.",
      ] },
    definitions, tables, variants: variantData, data_acceptance: dataAcceptance, static_findings: staticFindings, runtime_results: [] };
}

function sorted(value) {
  return Array.isArray(value) ? value.map(sorted) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
}
export const projectionHash = value => sha(JSON.stringify(sorted(value)));
export const initialSnapshotHashes = Object.freeze({
  definitions: "3bc78e0f857ffe26f08c14ac12105e1280f044cb26b49fe99d22aa7a9185a1e7",
  tables: "06ec3bb9baf5203a7f4b684d1581e6f9834ad32272471de29cdfa77cae7d13ee",
  variants: "c5e6eabc1c88e92feb5d45b2ff956b53be8f29799c0401c2c1a5c5232f2cb768",
});
export function validateDataSnapshot(inventory) {
  const legacyVariants = structuredClone(inventory.variants);
  for (const [key, expected] of [["brogue", '"brogue"'], ["rapid_brogue", '"rapidBrogue"'], ["bullet_brogue", '"bulletBrogue"']]) {
    if (legacyVariants[key].constants.variantName.expression !== expected) throw new Error(`Unexpected ${key} literal correction`);
    legacyVariants[key].constants.variantName.expression = '"';
  }
  const legacyTables = structuredClone(inventory.tables);
  for (const table of legacyTables.filter(t => t.base_table === "blueprintCatalog")) {
    if (table.rows[48].first_string !== "Summoning circle -- key in a room with an eldritch totem, glyphs unavoidable. // DISABLED. (Not fun enough.)") {
      throw new Error(`Unexpected ${table.source.symbol} literal correction`);
    }
    delete table.rows[48].first_string;
  }
  const actual = { definitions: projectionHash(inventory.definitions), tables: projectionHash(legacyTables), variants: projectionHash(legacyVariants) };
  for (const key of Object.keys(actual)) if (actual[key] !== initialSnapshotHashes[key]) throw new Error(`CE 1.15.1 ${key} differs from the initial source inventory`);
  return { groups: Object.keys(inventory.definitions).length,
    definitions: Object.values(inventory.definitions).reduce((n, group) => n + group.definition_count, 0), tables: inventory.tables.length, variants: Object.keys(inventory.variants).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let output = path.join(repositoryRoot, ".local/feature-verification/data-inventory.json"), check = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--output" && process.argv[i + 1]) output = path.resolve(process.argv[++i]);
    else if (process.argv[i] === "--check") check = true;
    else throw new Error(`Unknown/incomplete argument: ${process.argv[i]}`);
  }
  const inventory = generateDataInventory(), counts = validateDataSnapshot(inventory);
  const serialized = JSON.stringify(inventory, null, 2) + "\n";
  if (check) {
    if (readFileSync(output, "utf8") !== serialized) throw new Error(`Inventory is stale: ${output}`);
  } else {
    mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, serialized, "utf8");
  }
  console.log(JSON.stringify({ [check ? "checked" : "generated"]: output, ...counts }));
}
