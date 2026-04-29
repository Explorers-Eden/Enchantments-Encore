const fs = require("fs");
const path = require("path");

const inputRoot = "data";
const outputRoot = "markdown";

function walk(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files = files.concat(walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
}

function titleCase(id) {
  return id
    .replace(/^#/, "")
    .replace(/^[^:]+:/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getStackSize(entry) {
  const fn = entry.functions?.find(f => f.function === "minecraft:set_count");
  if (!fn) return "1";

  const count = fn.count;
  if (typeof count === "number") return String(count);

  if (count?.min !== undefined && count?.max !== undefined) {
    return `${count.min}–${count.max}`;
  }

  return "1";
}

function getBookLabel(entry) {
  const enchantFn = entry.functions?.find(
    f => f.function === "minecraft:enchant_with_levels"
  );

  if (!enchantFn?.options) return "Enchanted Book";

  return `Enchanted Book (${titleCase(enchantFn.options)})`;
}

function renderPool(pool, index) {
  const entries = pool.entries ?? [];
  const totalWeight = entries.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);

  const rows = entries
    .map(entry => {
      const item =
        entry.name === "minecraft:book" &&
        entry.functions?.some(f => f.function === "minecraft:enchant_with_levels")
          ? getBookLabel(entry)
          : titleCase(entry.name ?? "unknown");

      const stackSize = getStackSize(entry);
      const weight = entry.weight ?? 1;
      const chanceValue = totalWeight > 0 ? weight / totalWeight : 0;
      const chance = `${(chanceValue * 100).toFixed(1)}%`;

      return {
        item,
        stackSize,
        weight,
        chance,
        chanceValue
      };
    })
    .sort((a, b) => b.chanceValue - a.chanceValue || a.item.localeCompare(b.item));

  return `## Pool ${index + 1}

| Item | Stack Size | Weight | Chance |
|:-----|:----------:|:------:|:------:|
${rows.map(row => `| ${row.item} | ${row.stackSize} | ${row.weight} | ${row.chance} |`).join("\n")}`;
}

function generateMarkdown(json, sourcePath) {
  const title = titleCase(path.basename(sourcePath, ".json"));
  const pools = json.pools ?? [];

  return `# ${title}

${pools.map(renderPool).join("\n\n")}
`;
}

function getLootTableInfo(file) {
  const parts = file.split(path.sep);
  const dataIndex = parts.indexOf("data");
  const lootTableIndex = parts.indexOf("loot_table");

  if (dataIndex === -1 || lootTableIndex === -1) return null;
  if (lootTableIndex !== dataIndex + 2) return null;

  const namespace = parts[dataIndex + 1];
  const relativeLootPath = parts.slice(lootTableIndex + 1).join(path.sep);

  return {
    namespace,
    relativeLootPath
  };
}

function removeStaleMarkdownFiles(validOutputFiles) {
  const markdownFiles = walk(outputRoot).filter(file =>
    file.split(path.sep).includes("loot_table") && file.endsWith(".md")
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

  const markdown = generateMarkdown(json, file);
  fs.writeFileSync(outputPath, markdown);

  console.log(`Generated ${outputPath}`);
}

removeStaleMarkdownFiles(validOutputFiles);