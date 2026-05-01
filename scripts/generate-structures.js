// scripts/generate-structures.js
const fs = require("fs");
const path = require("path");
const https = require("https");
const nbt = require("prismarine-nbt");

const inputRoot = "data";
const assetsRoot = "assets";
const outputRoot = path.join("wiki", "markdown");
const outputExtension = ".md";

const IGNORED_BLOCKS = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
  "minecraft:water",
  "minecraft:lava",
  "minecraft:jigsaw"
]);

const IGNORED_ENTITIES = new Set([
  "minecraft:marker",
  "minecraft:text_display",
  "minecraft:block_display",
  "minecraft:item_display"
]);

function walk(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walk(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }

  return files;
}

function loadLangFiles() {
  const result = {};

  for (const file of walk(assetsRoot)) {
    if (!file.endsWith(path.join("lang", "en_us.json"))) continue;

    try {
      Object.assign(result, JSON.parse(fs.readFileSync(file, "utf8")));
    } catch {
      console.warn(`Could not read lang file: ${file}`);
    }
  }

  return result;
}

const lang = loadLangFiles();

function compareVersionParts(a, b) {
  const aParts = String(a).split(".").map(part => Number(part));
  const bParts = String(b).split(".").map(part => Number(part));
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const aValue = Number.isFinite(aParts[i]) ? aParts[i] : 0;
    const bValue = Number.isFinite(bParts[i]) ? bParts[i] : 0;

    if (aValue !== bValue) return aValue - bValue;
  }

  return String(a).localeCompare(String(b));
}

function getLatestMinecraftVersionFromReleaseInfo() {
  const file = "release_infos.yml";
  if (!fs.existsSync(file)) return null;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const versions = [];
  let inVersions = false;
  let versionsIndent = null;

  for (const line of lines) {
    const match = line.match(/^(\s*)Versions\s*:/);

    if (match) {
      inVersions = true;
      versionsIndent = match[1].length;
      continue;
    }

    if (!inVersions) continue;

    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    if (line.trim() && currentIndent <= versionsIndent && !line.trim().startsWith("-")) {
      break;
    }

    const versionMatch = line.match(/^\s*-\s*["']?([^"'\s#]+)["']?/);
    if (versionMatch) versions.push(versionMatch[1]);
  }

  if (versions.length === 0) return null;

  return versions.sort(compareVersionParts).at(-1);
}

const vanillaLootTableVersion = getLatestMinecraftVersionFromReleaseInfo();

function fetchJson(url) {
  return new Promise(resolve => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Explorers-Eden-Markdown-Generator"
          }
        },
        response => {
          if (response.statusCode !== 200) {
            response.resume();
            resolve(null);
            return;
          }

          let body = "";
          response.setEncoding("utf8");
          response.on("data", chunk => {
            body += chunk;
          });
          response.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        }
      )
      .on("error", () => resolve(null));
  });
}

function titleCase(id) {
  return String(id)
    .replace(/^#/, "")
    .replace(/^[^:]+:/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function addCount(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function cleanTag(id) {
  return String(id).replace(/^#/, "");
}

function getStructureInfo(file) {
  const parts = file.split(path.sep);
  const dataIndex = parts.indexOf("data");
  const structureIndex = parts.indexOf("structure");

  if (dataIndex === -1 || structureIndex === -1) return null;
  if (structureIndex !== dataIndex + 2) return null;

  const namespace = parts[dataIndex + 1];
  const relativeParts = parts.slice(structureIndex + 1);
  if (relativeParts.length === 0) return null;

  const topFolder =
    relativeParts.length > 1
      ? relativeParts[0]
      : path.basename(relativeParts[0], ".nbt");

  const structureFile = relativeParts.join("/").replace(/\.nbt$/, "");

  return { namespace, topFolder, structureFile };
}

function collectLootTables(obj, map = new Map()) {
  if (obj === null || obj === undefined) return map;

  if (Array.isArray(obj)) {
    for (const value of obj) collectLootTables(value, map);
    return map;
  }

  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      if ((key === "LootTable" || key === "loot_table") && typeof value === "string") {
        addCount(map, value);
      }

      collectLootTables(value, map);
    }
  }

  return map;
}

function getPalette(structure) {
  if (Array.isArray(structure.palette)) return structure.palette;
  if (Array.isArray(structure.palettes?.[0])) return structure.palettes[0];
  return [];
}

function getBlockNameFromPaletteEntry(entry) {
  return entry?.Name ?? entry?.name ?? null;
}

function collectStructureData(structure) {
  const blockCounts = new Map();
  const entityCounts = new Map();
  const lootTables = new Map();

  const palette = getPalette(structure);

  for (const block of structure.blocks ?? []) {
    const state = palette[block.state];
    const blockName = getBlockNameFromPaletteEntry(state);

    if (blockName && !IGNORED_BLOCKS.has(blockName)) {
      addCount(blockCounts, blockName);
    }

    if (block.nbt) collectLootTables(block.nbt, lootTables);
  }

  for (const entity of structure.entities ?? []) {
    const entityData = entity.nbt ?? entity;
    const entityId = entityData.id;

    if (entityId && !IGNORED_ENTITIES.has(entityId)) {
      addCount(entityCounts, entityId);
    }

    collectLootTables(entityData, lootTables);
  }

  return { blockCounts, entityCounts, lootTables };
}

function mergeTotals(target, source) {
  for (const [key, count] of source.blockCounts.entries()) {
    addCount(target.blockCounts, key, count);
  }

  for (const [key, count] of source.entityCounts.entries()) {
    addCount(target.entityCounts, key, count);
  }

  for (const [lootTable, count] of source.lootTables.entries()) {
    addCount(target.lootTables, lootTable, count);
  }
}

function sortedCountRows(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function sortedLootTables(map) {
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function resolveTextComponent(component) {
  if (component === undefined || component === null) return null;
  if (typeof component === "string") return component;

  if (typeof component === "object") {
    if (component.translate === "filled_map.buried_treasure") return "Buried Treasure Map";

    if (component.translate) {
      return lang[component.translate] ?? component.fallback ?? component.translate;
    }

    if (component.text) return component.text;
    if (component.fallback) return component.fallback;
  }

  return null;
}

function withInheritedFunctions(entry, inheritedFunctions = []) {
  const functions = [
    ...inheritedFunctions,
    ...(entry.functions ?? [])
  ];

  return functions.length > 0 ? { ...entry, functions } : entry;
}

function getItemNameComponent(entry) {
  const componentSources = [
    entry.components,
    ...((entry.functions ?? [])
      .filter(f => f.function === "minecraft:set_components")
      .map(f => f.components) ?? [])
  ];

  for (const components of componentSources) {
    const itemName = components?.["minecraft:item_name"] ?? components?.item_name;
    if (itemName !== undefined) return itemName;
  }

  const nameFn =
    entry.functions?.find(f => f.function === "minecraft:set_name") ??
    entry.functions?.find(f => f.function === "minecraft:set_custom_name");

  return nameFn?.name;
}

function getStackSize(entry) {
  const fn = entry.functions?.find(f => f.function === "minecraft:set_count");
  if (!fn) return "1";

  const count = fn.count;
  if (typeof count === "number") return String(count);

  if (count?.min !== undefined && count?.max !== undefined) return `${count.min}–${count.max}`;
  if (count?.type === "minecraft:uniform") return `${count.min}–${count.max}`;

  return "1";
}

function isEnchantedBook(entry) {
  return (
    entry.name === "minecraft:book" &&
    entry.functions?.some(
      f =>
        f.function === "minecraft:enchant_with_levels" ||
        f.function === "minecraft:enchant_randomly"
    )
  );
}

function getLootTableFile(id) {
  const cleaned = cleanTag(id);
  const [namespace, lootPath] = cleaned.includes(":")
    ? cleaned.split(":")
    : ["minecraft", cleaned];

  return path.join(inputRoot, namespace, "loot_table", `${lootPath}.json`);
}

async function fetchVanillaLootTableJson(id) {
  const cleaned = cleanTag(id);
  const [namespace, lootPath] = cleaned.includes(":")
    ? cleaned.split(":")
    : ["minecraft", cleaned];

  if (namespace !== "minecraft" || !vanillaLootTableVersion) return null;

  const url = `https://raw.githubusercontent.com/misode/mcmeta/${vanillaLootTableVersion}/data/minecraft/loot_table/${lootPath}.json`;
  const json = await fetchJson(url);

  if (json) {
    console.log(`Fetched vanilla loot table ${cleaned} from mcmeta ${vanillaLootTableVersion}`);
  } else {
    console.warn(`Could not find vanilla loot table ${cleaned} in repo or mcmeta ${vanillaLootTableVersion}`);
  }

  return json;
}

async function loadLootTableJson(id) {
  const file = getLootTableFile(id);

  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      console.warn(`Could not read loot table: ${file}`);
    }
  }

  return await fetchVanillaLootTableJson(id);
}

function flattenRawEntries(entries, inheritedFunctions = []) {
  const result = [];

  for (const entry of entries ?? []) {
    const entryFunctions = [
      ...inheritedFunctions,
      ...(entry.functions ?? [])
    ];

    if (
      entry.type === "minecraft:alternatives" ||
      entry.type === "minecraft:group" ||
      entry.type === "minecraft:sequence"
    ) {
      result.push(...flattenRawEntries(entry.children ?? [], entryFunctions));
      continue;
    }

    result.push(withInheritedFunctions(entry, inheritedFunctions));
  }

  return result;
}

async function getSingleEntryFromLootTable(id, seen = new Set()) {
  const cleaned = cleanTag(id);
  if (seen.has(cleaned)) return null;
  seen.add(cleaned);

  const json = await loadLootTableJson(cleaned);
  if (!json) return null;

  try {
    const entries = [];

    for (const pool of json.pools ?? []) {
      entries.push(...flattenRawEntries(pool.entries ?? [], pool.functions ?? []));
    }

    const nonEmptyEntries = entries.filter(e => e.type !== "minecraft:empty");
    if (nonEmptyEntries.length === 1) return nonEmptyEntries[0];
  } catch {
    return null;
  }

  return null;
}

async function getItemName(entry, seenLootTables = new Set()) {
  if (entry.type === "minecraft:empty") return "Empty";

  if (entry.type === "minecraft:loot_table") {
    const lootTable = cleanTag(entry.value ?? entry.name ?? "unknown");
    const singleEntry = await getSingleEntryFromLootTable(lootTable, seenLootTables);

    if (singleEntry) return await getItemName(singleEntry, seenLootTables);

    return `Loot Table (${lootTable})`;
  }

  const customName = resolveTextComponent(getItemNameComponent(entry));
  if (customName) return customName;

  if (isEnchantedBook(entry)) return "Enchanted Book";

  if (entry.type === "minecraft:tag") return `Tag (${cleanTag(entry.name ?? "unknown")})`;

  if (entry.name) return titleCase(entry.name);

  return titleCase(entry.type ?? "unknown");
}

async function flattenEntries(
  entries,
  inheritedWeight = 1,
  inheritedFunctions = [],
  seenLootTables = new Set()
) {
  const result = [];

  for (const entry of entries ?? []) {
    const weight = entry.weight ?? 1;
    const combinedWeight = inheritedWeight * weight;

    const entryFunctions = [
      ...inheritedFunctions,
      ...(entry.functions ?? [])
    ];

    if (
      entry.type === "minecraft:alternatives" ||
      entry.type === "minecraft:group" ||
      entry.type === "minecraft:sequence"
    ) {
      result.push(
        ...await flattenEntries(
          entry.children ?? [],
          combinedWeight,
          entryFunctions,
          seenLootTables
        )
      );
      continue;
    }

    if (entry.type === "minecraft:loot_table") {
      const lootTable = cleanTag(entry.value ?? entry.name ?? "unknown");

      if (seenLootTables.has(lootTable)) {
        result.push({
          item: `Loot Table (${lootTable})`,
          stackSize: getStackSize(withInheritedFunctions(entry, inheritedFunctions)),
          weight: combinedWeight
        });
        continue;
      }

      const nestedJson = await loadLootTableJson(lootTable);

      if (!nestedJson) {
        result.push({
          item: `Loot Table (${lootTable})`,
          stackSize: getStackSize(withInheritedFunctions(entry, inheritedFunctions)),
          weight: combinedWeight
        });
        continue;
      }

      const nextSeenLootTables = new Set(seenLootTables);
      nextSeenLootTables.add(lootTable);

      for (const nestedPool of nestedJson.pools ?? []) {
        result.push(
          ...await flattenEntries(
            nestedPool.entries ?? [],
            combinedWeight,
            [
              ...entryFunctions,
              ...(nestedPool.functions ?? [])
            ],
            nextSeenLootTables
          )
        );
      }

      continue;
    }

    const inheritedEntry = withInheritedFunctions(entry, inheritedFunctions);

    result.push({
      item: await getItemName(inheritedEntry, seenLootTables),
      stackSize: getStackSize(inheritedEntry),
      weight: combinedWeight
    });
  }

  return result;
}

function mergeRowsByItem(rows) {
  const merged = new Map();

  for (const row of rows) {
    const key = `${row.pool}::${row.item}::${row.stackSize}`;

    if (!merged.has(key)) merged.set(key, { ...row });
    else merged.get(key).weight += row.weight;
  }

  return [...merged.values()];
}

async function renderMergedPools(pools) {
  const rows = [];

  for (const [poolIndex, pool] of (pools ?? []).entries()) {
    const flattenedEntries = await flattenEntries(pool.entries ?? [], 1, pool.functions ?? [], new Set());
    const nonEmptyFlattenedEntries = flattenedEntries.filter(entry => entry.item !== "Empty");
    const totalWeight = flattenedEntries.reduce((sum, entry) => sum + entry.weight, 0);

    const mergedEntries = mergeRowsByItem(
      nonEmptyFlattenedEntries.map(entry => ({
        ...entry,
        pool: poolIndex + 1
      }))
    );

    for (const entry of mergedEntries) {
      const chanceValue = totalWeight > 0 ? entry.weight / totalWeight : 0;

      rows.push({
        item: entry.item,
        stackSize: entry.stackSize,
        pool: entry.pool,
        weight: entry.weight,
        chanceValue,
        chance: `${(chanceValue * 100).toFixed(1)}%`
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.pool - b.pool ||
      b.chanceValue - a.chanceValue ||
      a.item.localeCompare(b.item)
  );

  return `| Item | Stack Size | Pool | Weight | Chance |
|:-----|:----------:|:----:|:------:|:------:|
${rows
  .map(row => `| ${row.item} | ${row.stackSize} | ${row.pool} | ${row.weight} | ${row.chance} |`)
  .join("\n")}`;
}

function renderCountTable(title, singular, rows) {
  if (rows.length === 0) {
    return `### ${title}

*None*
`;
  }

  return `### ${title}

| ${singular} | Count |
|:-----|:-----:|
${rows.map(([name, count]) => `| ${titleCase(name)} | ${count} |`).join("\n")}
`;
}

function renderLootTableTable(lootTables) {
  if (lootTables.length === 0) {
    return `### Loot Tables

*None*
`;
  }

  return `### Loot Tables

| Loot Table | Count |
|:-----|:-----:|
${lootTables.map(([id, count]) => `| ${id} | ${count} |`).join("\n")}
`;
}

async function renderGeneratedLootSection(lootTables) {
  const sorted = sortedLootTables(lootTables);

  if (sorted.length === 0) {
    return "";
  }

  const tables = [];

  for (const [id, count] of sorted) {
    const json = await loadLootTableJson(id);

    let content;

    if (!json) {
      content = `Could not find this loot table locally or in mcmeta ${vanillaLootTableVersion ?? "unknown"}.`;
    } else {
      content = await renderMergedPools(json.pools ?? []);
    }

    tables.push(`<details>
<summary><strong>${id}</strong> (${count} ${pluralize(count, "use")})</summary>

${content}

</details>`);
  }

  return `# Generated Loot.

There are ${sorted.length} loot tables used in this structure:
<br>

${tables.join("\n\n")}

`;
}

function renderTextSummary(data, isPart = false) {
  const blocks = sortedCountRows(data.blockCounts).map(([name]) => titleCase(name));
  const entities = sortedCountRows(data.entityCounts).map(([name]) => titleCase(name));

  const blocksLine =
    blocks.length > 0
      ? `${isPart ? "The structure part" : "The structure"} is composed of the following blocks: ${blocks.join(", ")}.`
      : `${isPart ? "The structure part" : "The structure"} does not contain any notable blocks.`;

  const entitiesLine =
    entities.length > 0
      ? `Additionally, the following entities may spawn during its generation: ${entities.join(", ")}.`
      : "";

  return `${blocksLine}

${entitiesLine ? entitiesLine + "\n\n" : ""}`;
}

function renderStructureSection(structureFile, data) {
  return `<details>
<summary><strong>${titleCase(structureFile)}</strong></summary>

${renderTextSummary(data, true)}${renderCountTable("Blocks", "Block", sortedCountRows(data.blockCounts))}

${renderCountTable("Entities", "Entity", sortedCountRows(data.entityCounts))}

${renderLootTableTable(sortedLootTables(data.lootTables))}

</details>`;
}

function renderSummarySection(totals) {
  return `# Contents

${renderTextSummary(totals, false)}`;
}

async function generateMarkdown(groupName, structures, totals) {
  const generatedLoot = await renderGeneratedLootSection(totals.lootTables);

  return `${generatedLoot}${renderSummarySection(totals)}

## Per-Structure File Contents

${structures.map(entry => renderStructureSection(entry.structureFile, entry.data)).join("\n\n")}
`;
}

async function readNbtFile(file) {
  const buffer = fs.readFileSync(file);
  const parsed = await nbt.parse(buffer);
  return nbt.simplify(parsed.parsed);
}

function removeStaleOutputFiles(validOutputFiles, namespaces) {
  for (const namespace of namespaces) {
    const structureRoot = path.join(outputRoot, namespace, "structure");

    if (!fs.existsSync(structureRoot)) continue;

    const outputFiles = walk(structureRoot).filter(file => file.endsWith(outputExtension));

    for (const file of outputFiles) {
      const normalized = path.normalize(file);

      if (!validOutputFiles.has(normalized)) {
        fs.rmSync(file);
        console.log(`Removed stale ${file}`);
      }
    }
  }
}

async function main() {
  const structureFiles = walk(inputRoot)
    .filter(file => file.endsWith(".nbt"))
    .map(file => ({ file, info: getStructureInfo(file) }))
    .filter(entry => entry.info !== null);

  const groups = new Map();

  for (const { file, info } of structureFiles) {
    const key = `${info.namespace}:${info.topFolder}`;

    if (!groups.has(key)) {
      groups.set(key, {
        namespace: info.namespace,
        topFolder: info.topFolder,
        files: []
      });
    }

    groups.get(key).files.push({
      path: file,
      structureFile: info.structureFile
    });
  }

  const validOutputFiles = new Set();
  const namespaces = new Set();

  for (const group of groups.values()) {
    namespaces.add(group.namespace);

    const structures = [];
    const totals = {
      blockCounts: new Map(),
      entityCounts: new Map(),
      lootTables: new Map()
    };

    for (const file of group.files) {
      const structure = await readNbtFile(file.path);
      const data = collectStructureData(structure);

      structures.push({
        structureFile: file.structureFile,
        data
      });

      mergeTotals(totals, data);
    }

    structures.sort((a, b) => a.structureFile.localeCompare(b.structureFile));

    const outputPath = path.join(
      outputRoot,
      group.namespace,
      "structure",
      `${group.topFolder}${outputExtension}`
    );

    validOutputFiles.add(path.normalize(outputPath));

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, await generateMarkdown(group.topFolder, structures, totals));

    console.log(`Generated ${outputPath}`);
  }

  removeStaleOutputFiles(validOutputFiles, namespaces);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});