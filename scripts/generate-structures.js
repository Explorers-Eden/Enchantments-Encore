// scripts/generate-structures.js
const fs = require("fs");
const path = require("path");
const nbt = require("prismarine-nbt");

const inputRoot = "data";
const outputRoot = path.join("wiki", "markdown");
const outputExtension = ".mb";

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

  return {
    namespace,
    topFolder,
    structureFile
  };
}

function collectLootTables(obj, set = new Set()) {
  if (obj === null || obj === undefined) return set;

  if (Array.isArray(obj)) {
    for (const value of obj) collectLootTables(value, set);
    return set;
  }

  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      if ((key === "LootTable" || key === "loot_table") && typeof value === "string") {
        set.add(value);
      }

      collectLootTables(value, set);
    }
  }

  return set;
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
  const lootTables = new Set();

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

  for (const lootTable of source.lootTables) {
    target.lootTables.add(lootTable);
  }
}

function sortedCountRows(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function sortedLootTables(set) {
  return [...set].sort();
}

function renderCountTable(title, singular, rows) {
  if (rows.length === 0) {
    return `### ${title}

None
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

None
`;
  }

  return `### Loot Tables

| Loot Table |
|:-----|
${lootTables.map(id => `| ${id} |`).join("\n")}
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

function generateMarkdown(groupName, structures, totals) {
  return `# Contents
${renderTextSummary(totals, false)}
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
      lootTables: new Set()
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
    fs.writeFileSync(outputPath, generateMarkdown(group.topFolder, structures, totals));

    console.log(`Generated ${outputPath}`);
  }

  removeStaleOutputFiles(validOutputFiles, namespaces);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});