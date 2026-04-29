const fs = require("fs");
const path = require("path");

const inputRoot = "data";
const outputRoot = path.join("wiki", "markdown");

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

function cleanTag(id) {
  return String(id).replace(/^#/, "");
}

function getStackSize(entry) {
  const fn = entry.functions?.find(f => f.function === "minecraft:set_count");
  if (!fn) return "1";

  const count = fn.count;

  if (typeof count === "number") return String(count);

  if (count?.min !== undefined && count?.max !== undefined) {
    return `${count.min}–${count.max}`;
  }

  if (count?.type === "minecraft:uniform") {
    return `${count.min}–${count.max}`;
  }

  return "1";
}

function getBookLabel(entry) {
  const enchantFn =
    entry.functions?.find(f => f.function === "minecraft:enchant_with_levels") ||
    entry.functions?.find(f => f.function === "minecraft:enchant_randomly");

  if (!enchantFn?.options) return "Enchanted Book";

  return `Enchanted Book (${cleanTag(enchantFn.options)})`;
}

function getItemName(entry) {
  if (entry.type === "minecraft:empty") return "Empty";

  if (
    entry.name === "minecraft:book" &&
    entry.functions?.some(
      f =>
        f.function === "minecraft:enchant_with_levels" ||
        f.function === "minecraft:enchant_randomly"
    )
  ) {
    return getBookLabel(entry);
  }

  if (entry.name) return titleCase(entry.name);

  return titleCase(entry.type ?? "unknown");
}

function flattenEntries(entries, inheritedWeight = 1) {
  const result = [];

  for (const entry of entries ?? []) {
    const weight = entry.weight ?? 1;
    const combinedWeight = inheritedWeight * weight;

    if (
      entry.type === "minecraft:alternatives" ||
      entry.type === "minecraft:group" ||
      entry.type === "minecraft:sequence"
    ) {
      result.push(...flattenEntries(entry.children ?? [], combinedWeight));
      continue;
    }

    if (entry.type === "minecraft:tag") {
      result.push({
        item: `Tag (${cleanTag(entry.name ?? "unknown")})`,
        stackSize: getStackSize(entry),
        weight: combinedWeight
      });
      continue;
    }

    result.push({
      item: getItemName(entry),
      stackSize: getStackSize(entry),
      weight: combinedWeight
    });
  }

  return result;
}

function renderMergedPools(pools) {
  const rows = [];

  pools.forEach((pool, poolIndex) => {
    const flattenedEntries = flattenEntries(pool.entries ?? []);
    const totalWeight = flattenedEntries.reduce((sum, entry) => sum + entry.weight, 0);

    for (const entry of flattenedEntries) {
      const chanceValue = totalWeight > 0 ? entry.weight / totalWeight : 0;

      rows.push({
        item: entry.item,
        stackSize: entry.stackSize,
        pool: poolIndex + 1,
        weight: entry.weight,
        chanceValue,
        chance: `${(chanceValue * 100).toFixed(1)}%`
      });
    }
  });

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

function generateMarkdown(json, sourcePath) {
  const title = titleCase(path.basename(sourcePath, ".json"));
  const pools = json.pools ?? [];

  return `# ${title}

${renderMergedPools(pools)}
`;
}

function getLootTableInfo(file) {
  const parts = file.split(path.sep);
  const dataIndex = parts.indexOf("data");
  const lootTableIndex = parts.indexOf("loot_table");

  if (dataIndex === -1 || lootTableIndex === -1) return null;
  if (lootTableIndex !== dataIndex + 2) return null;

  return {
    namespace: parts[dataIndex + 1],
    relativeLootPath: parts.slice(lootTableIndex + 1).join(path.sep)
  };
}

function removeStaleMarkdownFiles(validOutputFiles) {
  const markdownFiles = walk(outputRoot).filter(
    file => file.split(path.sep).includes("loot_table") && file.endsWith(".md")
  );

  for (const file of markdownFiles) {
    const normalized = path.normalize(file);

    if (!validOutputFiles.has(normalized)) {
      fs.rmSync(file);
      console.log(`Removed stale ${file}`);
    }
  }
}

const lootTableFiles = walk(inputRoot)
  .filter(file => file.endsWith(".json"))
  .map(file => ({ file, info: getLootTableInfo(file) }))
  .filter(entry => entry.info !== null);

const validOutputFiles = new Set();

for (const { file, info } of lootTableFiles) {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  const outputPath = path.join(
    outputRoot,
    info.namespace,
    "loot_table",
    info.relativeLootPath.replace(/\.json$/, ".md")
  );

  validOutputFiles.add(path.normalize(outputPath));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, generateMarkdown(json, file));

  console.log(`Generated ${outputPath}`);
}

removeStaleMarkdownFiles(validOutputFiles);