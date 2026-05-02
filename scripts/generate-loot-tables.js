const fs = require("fs");
const path = require("path");
const https = require("https");

const inputRoot = "data";
const assetsRoot = "assets";
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getMinecraftVersionsFromReleaseInfo() {
  const file = "release_infos.yml";
  if (!fs.existsSync(file)) return [];

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

  return versions.sort(compareVersionParts);
}

function getVanillaLootTableRefs() {
  const versions = getMinecraftVersionsFromReleaseInfo();
  const latestFirst = versions.slice().reverse();

  return unique([
    vanillaLootTableVersion && `${vanillaLootTableVersion}-data`,
    vanillaLootTableVersion,
    ...latestFirst.map(version => `${version}-data`),
    ...latestFirst,
    "data"
  ]);
}

function getVanillaLootTableSourceLabel() {
  const refs = getVanillaLootTableRefs();
  return refs.length > 0 ? refs.join(", ") : "unknown";
}

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

async function fetchVanillaLootTableJson(id) {
  const cleaned = cleanTag(id);
  const [namespace, lootPath] = cleaned.includes(":")
    ? cleaned.split(":")
    : ["minecraft", cleaned];

  if (namespace !== "minecraft") return null;

  const refs = getVanillaLootTableRefs();

  for (const ref of refs) {
    const url = `https://raw.githubusercontent.com/misode/mcmeta/${ref}/data/minecraft/loot_table/${lootPath}.json`;
    const json = await fetchJson(url);

    if (json) {
      console.log(`Fetched vanilla loot table ${cleaned} from mcmeta ${ref}`);
      return json;
    }
  }

  console.warn(`Could not find vanilla loot table ${cleaned} in repo or mcmeta refs: ${getVanillaLootTableSourceLabel()}`);
  return null;
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

async function flattenEntries(entries, inheritedWeight = 1, inheritedFunctions = []) {
  const result = [];

  for (const entry of entries ?? []) {
    const weight = entry.weight ?? 1;
    const combinedWeight = inheritedWeight * weight;

    const entryFunctions = [
      ...inheritedFunctions,
      ...(entry.functions ?? [])
    ];

    const inheritedEntry = withInheritedFunctions(entry, inheritedFunctions);

    if (
      entry.type === "minecraft:alternatives" ||
      entry.type === "minecraft:group" ||
      entry.type === "minecraft:sequence"
    ) {
      result.push(...await flattenEntries(entry.children ?? [], combinedWeight, entryFunctions));
      continue;
    }

    result.push({
      item: await getItemName(inheritedEntry),
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
    const flattenedEntries = await flattenEntries(pool.entries ?? [], 1, pool.functions ?? []);
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

async function generateMarkdown(json, sourcePath) {
  const title = titleCase(path.basename(sourcePath, ".json"));

  return `# ${title}

${await renderMergedPools(json.pools ?? [])}
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
    relativePath: parts.slice(lootTableIndex + 1).join(path.sep)
  };
}

function removeStaleMarkdownFiles(validOutputFiles, namespaces) {
  for (const namespace of namespaces) {
    const lootTableRoot = path.join(outputRoot, namespace, "loot_table");

    if (!fs.existsSync(lootTableRoot)) continue;

    for (const file of walk(lootTableRoot).filter(file => file.endsWith(".md"))) {
      const normalized = path.normalize(file);

      if (!validOutputFiles.has(normalized)) {
        fs.rmSync(file);
        console.log(`Removed stale ${file}`);
      }
    }
  }
}

async function main() {
  const lootTableFiles = walk(inputRoot)
    .filter(file => file.endsWith(".json"))
    .map(file => ({ file, info: getLootTableInfo(file) }))
    .filter(entry => entry.info !== null);

  const validOutputFiles = new Set();
  const namespaces = new Set();

  for (const { file, info } of lootTableFiles) {
    namespaces.add(info.namespace);

    const json = JSON.parse(fs.readFileSync(file, "utf8"));

    const outputPath = path.join(
      outputRoot,
      info.namespace,
      "loot_table",
      info.relativePath.replace(/\.json$/, ".md")
    );

    validOutputFiles.add(path.normalize(outputPath));

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, await generateMarkdown(json, file));

    console.log(`Generated ${outputPath}`);
  }

  removeStaleMarkdownFiles(validOutputFiles, namespaces);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
