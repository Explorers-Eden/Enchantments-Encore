const fs = require("fs");
const path = require("path");
const nbt = require("prismarine-nbt");

const inputRoot = "data";
const outputRoot = path.join("wiki", "markdown");

const IGNORED_BLOCKS = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
  "minecraft:water",
  "minecraft:lava"
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

  return {
    namespace: parts[dataIndex + 1],
    relativePath: parts.slice(structureIndex + 1).join(path.sep)
  };
}

function renderCountTable(title, singular, rows) {
  if (rows.length === 0) {
    return `## ${title}

None found.
`;
  }

  return `## ${title}

| ${singular} | Count |
|:-----|:-----:|
${rows.map(([name, count]) => `| ${titleCase(name)} | ${count} |`).join("\n")}
`;
}

function renderLootTableTable(lootTables) {
  if (lootTables.length === 0) {
    return `## Loot Tables

None found.
`;
  }

  return `## Loot Tables

| Loot Table |
|:-----|
${lootTables.map(id => `| ${id} |`).join("\n")}
`;
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

function generateMarkdown(structure, sourcePath) {
  const title = titleCase(path.basename(sourcePath, ".nbt"));

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

  const sortedBlocks = [...blockCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  const sortedEntities = [...entityCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  const sortedLootTables = [...lootTables].sort();

  return `# ${title}

${renderCountTable("Blocks", "Block", sortedBlocks)}

${renderCountTable("Entities", "Entity", sortedEntities)}

${renderLootTableTable(sortedLootTables)}
`;
}

async function readNbtFile(file) {
  const buffer = fs.readFileSync(file);
  const parsed = await nbt.parse(buffer);
  return nbt.simplify(parsed.parsed);
}

function removeStaleMarkdownFiles(validOutputFiles) {
  const markdownFiles = walk(outputRoot).filter(
    file => file.split(path.sep).includes("structure") && file.endsWith(".md")
  );

  for (const file of markdownFiles) {
    const normalized = path.normalize(file);

    if (!validOutputFiles.has(normalized)) {
      fs.rmSync(file);
      console.log(`Removed stale ${file}`);
    }
  }
}

async function main() {
  const structureFiles = walk(inputRoot)
    .filter(file => file.endsWith(".nbt"))
    .map(file => ({ file, info: getStructureInfo(file) }))
    .filter(entry => entry.info !== null);

  const validOutputFiles = new Set();

  for (const { file, info } of structureFiles) {
    const structure = await readNbtFile(file);

    const outputPath = path.join(
      outputRoot,
      info.namespace,
      "structure",
      info.relativePath.replace(/\.nbt$/, ".md")
    );

    validOutputFiles.add(path.normalize(outputPath));

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, generateMarkdown(structure, file));

    console.log(`Generated ${outputPath}`);
  }

  removeStaleMarkdownFiles(validOutputFiles);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});