// scripts/generate-structure-previews.js
const fs = require("fs");
const path = require("path");
const nbt = require("prismarine-nbt");
const { PNG } = require("pngjs");

const inputRoot = process.env.STRUCTURE_INPUT_ROOT ?? "data";
const outputRoot = process.env.STRUCTURE_PREVIEW_OUTPUT_ROOT ?? path.join("wiki", "images", "structures");

const tileWidth = Number(process.env.STRUCTURE_PREVIEW_TILE_WIDTH ?? 18);
const tileHeight = Number(process.env.STRUCTURE_PREVIEW_TILE_HEIGHT ?? 10);
const blockHeight = Number(process.env.STRUCTURE_PREVIEW_BLOCK_HEIGHT ?? 12);
const padding = Number(process.env.STRUCTURE_PREVIEW_PADDING ?? 36);
const maxImageSize = Number(process.env.STRUCTURE_PREVIEW_MAX_SIZE ?? 2400);

const transparentBackground = String(process.env.STRUCTURE_PREVIEW_TRANSPARENT ?? "true") !== "false";

const IGNORED_BLOCKS = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
  "minecraft:structure_void",
  "minecraft:barrier",
  "minecraft:light",
  "minecraft:jigsaw"
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

  return { namespace, topFolder };
}

function getPalette(structure) {
  if (Array.isArray(structure.palette)) return structure.palette;
  if (Array.isArray(structure.palettes?.[0])) return structure.palettes[0];
  return [];
}

function getBlockNameFromPaletteEntry(entry) {
  return entry?.Name ?? entry?.name ?? null;
}

async function readNbtFile(file) {
  const buffer = fs.readFileSync(file);
  const parsed = await nbt.parse(buffer);
  return nbt.simplify(parsed.parsed);
}

const textureColorCache = new Map();
const blockColorCache = new Map();
const modelCache = new Map();

function readJsonIfExists(file) {
  if (modelCache.has(file)) return modelCache.get(file);

  if (!fs.existsSync(file)) {
    modelCache.set(file, null);
    return null;
  }

  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    modelCache.set(file, json);
    return json;
  } catch {
    modelCache.set(file, null);
    return null;
  }
}

function splitResourceLocation(id, defaultNamespace = "minecraft") {
  if (String(id).includes(":")) {
    const [namespace, ...rest] = String(id).split(":");
    return [namespace, rest.join(":")];
  }

  return [defaultNamespace, String(id)];
}

function getModelFileForBlock(blockName) {
  const [namespace, id] = splitResourceLocation(blockName);
  return path.join("assets", namespace, "models", "block", `${id}.json`);
}

function getTextureFile(textureId, defaultNamespace = "minecraft") {
  const [namespace, texturePath] = splitResourceLocation(textureId, defaultNamespace);
  return path.join("assets", namespace, "textures", `${texturePath}.png`);
}

function resolveTextureReference(textureRef, modelTextures = {}) {
  let current = textureRef;

  for (let i = 0; i < 16; i++) {
    if (!current || typeof current !== "string") return null;

    if (current.startsWith("#")) {
      current = modelTextures[current.slice(1)];
      continue;
    }

    return current;
  }

  return null;
}

function mergeModelTextures(model, namespace, seenModels = new Set()) {
  const textures = {};

  if (!model || typeof model !== "object") return textures;

  if (model.parent && typeof model.parent === "string") {
    const parentId = model.parent;
    const [parentNamespace, parentPath] = splitResourceLocation(parentId, namespace);
    const parentKey = `${parentNamespace}:${parentPath}`;

    if (!seenModels.has(parentKey)) {
      seenModels.add(parentKey);

      const parentFile = path.join(
        "assets",
        parentNamespace,
        "models",
        `${parentPath}.json`
      );

      Object.assign(
        textures,
        mergeModelTextures(readJsonIfExists(parentFile), parentNamespace, seenModels)
      );
    }
  }

  Object.assign(textures, model.textures ?? {});
  return textures;
}

function averageTextureColor(textureFile) {
  if (textureColorCache.has(textureFile)) return textureColorCache.get(textureFile);

  if (!fs.existsSync(textureFile)) {
    textureColorCache.set(textureFile, null);
    return null;
  }

  try {
    const png = PNG.sync.read(fs.readFileSync(textureFile));

    let r = 0;
    let g = 0;
    let b = 0;
    let totalWeight = 0;

    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const idx = (png.width * y + x) << 2;
        const alpha = png.data[idx + 3];

        if (alpha < 32) continue;

        const weight = alpha / 255;
        r += png.data[idx] * weight;
        g += png.data[idx + 1] * weight;
        b += png.data[idx + 2] * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) {
      textureColorCache.set(textureFile, null);
      return null;
    }

    const color = rgbToHex({
      r: r / totalWeight,
      g: g / totalWeight,
      b: b / totalWeight
    });

    textureColorCache.set(textureFile, color);
    return color;
  } catch {
    textureColorCache.set(textureFile, null);
    return null;
  }
}

function chooseTextureReference(textures) {
  if (!textures || typeof textures !== "object") return null;

  return (
    textures.all ??
    textures.side ??
    textures.top ??
    textures.end ??
    textures.front ??
    textures.north ??
    textures.south ??
    textures.east ??
    textures.west ??
    textures.particle ??
    Object.values(textures).find(value => typeof value === "string") ??
    null
  );
}

function getDynamicBlockColor(blockName) {
  if (blockColorCache.has(blockName)) return blockColorCache.get(blockName);

  const [namespace] = splitResourceLocation(blockName);
  const model = readJsonIfExists(getModelFileForBlock(blockName));

  if (!model) {
    blockColorCache.set(blockName, null);
    return null;
  }

  const textures = mergeModelTextures(model, namespace);
  const textureRef = chooseTextureReference(textures);
  const resolvedTexture = resolveTextureReference(textureRef, textures);

  if (!resolvedTexture) {
    blockColorCache.set(blockName, null);
    return null;
  }

  const textureFile = getTextureFile(resolvedTexture, namespace);
  const color = averageTextureColor(textureFile);

  blockColorCache.set(blockName, color);
  return color;
}

function hexToRgb(hex) {
  const cleaned = hex.replace("#", "");
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function shade(hex, amount) {
  const rgb = hexToRgb(hex);
  return rgbToHex({
    r: rgb.r * amount,
    g: rgb.g * amount,
    b: rgb.b * amount
  });
}

function hashColor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 28 + (Math.abs(hash >> 8) % 28);
  const lightness = 45 + (Math.abs(hash >> 16) % 18);

  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return rgbToHex({
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255
  });
}

function getBlockColor(blockName) {
  const dynamicColor = getDynamicBlockColor(blockName);
  if (dynamicColor) return dynamicColor;

  const short = blockName.replace(/^minecraft:/, "");

  if (short.includes("leaves")) return "#4f8c3a";
  if (short.includes("log") || short.includes("wood") || short.includes("stem") || short.includes("hyphae")) return "#8a5a2f";
  if (short.includes("planks") || short.includes("slab") || short.includes("stairs") || short.includes("fence") || short.includes("door") || short.includes("trapdoor")) return "#8a5a2f";
  if (short.includes("stone") || short.includes("slate") || short.includes("tuff") || short.includes("andesite") || short.includes("diorite") || short.includes("granite")) return "#777777";
  if (short.includes("sand")) return "#d6c27a";
  if (short.includes("copper")) return "#b87953";
  if (short.includes("glass")) return "#9ed0dd";
  if (short.includes("moss") || short.includes("grass")) return "#668a3a";
  if (short.includes("water")) return "#3d75c4";
  if (short.includes("lava")) return "#e65a1e";
  if (short.includes("amethyst")) return "#8f68c8";
  if (short.includes("carpet") || short.includes("wool")) return "#a85a5a";
  if (short.includes("bookshelf") || short.includes("lectern")) return "#9a6a32";
  if (short.includes("chest") || short.includes("barrel")) return "#b06f28";

  return hashColor(blockName);
}

function drawPixel(png, x, y, color, alpha = 255) {
  x = Math.round(x);
  y = Math.round(y);

  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;

  const idx = (png.width * y + x) << 2;
  const rgb = hexToRgb(color);

  if (alpha === 255 || png.data[idx + 3] === 0) {
    png.data[idx] = rgb.r;
    png.data[idx + 1] = rgb.g;
    png.data[idx + 2] = rgb.b;
    png.data[idx + 3] = alpha;
    return;
  }

  const existingAlpha = png.data[idx + 3] / 255;
  const newAlpha = alpha / 255;
  const outAlpha = newAlpha + existingAlpha * (1 - newAlpha);

  png.data[idx] = Math.round((rgb.r * newAlpha + png.data[idx] * existingAlpha * (1 - newAlpha)) / outAlpha);
  png.data[idx + 1] = Math.round((rgb.g * newAlpha + png.data[idx + 1] * existingAlpha * (1 - newAlpha)) / outAlpha);
  png.data[idx + 2] = Math.round((rgb.b * newAlpha + png.data[idx + 2] * existingAlpha * (1 - newAlpha)) / outAlpha);
  png.data[idx + 3] = Math.round(outAlpha * 255);
}

function drawPolygon(png, points, color, alpha = 255) {
  const minY = Math.floor(Math.min(...points.map(p => p.y)));
  const maxY = Math.ceil(Math.max(...points.map(p => p.y)));
  const minX = Math.floor(Math.min(...points.map(p => p.x)));
  const maxX = Math.ceil(Math.max(...points.map(p => p.x)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) {
        drawPixel(png, x, y, color, alpha);
      }
    }
  }
}

function pointInPolygon(x, y, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || 0.000001) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function isoPoint(x, y, z, offsetX, offsetY, scale = 1) {
  return {
    x: offsetX + (x - z) * (tileWidth / 2) * scale,
    y: offsetY + (x + z) * (tileHeight / 2) * scale - y * blockHeight * scale
  };
}

function makeCubeFaces(block, offsetX, offsetY, scale) {
  const { x, y, z, color } = block;

  const p000 = isoPoint(x, y, z, offsetX, offsetY, scale);
  const p100 = isoPoint(x + 1, y, z, offsetX, offsetY, scale);
  const p010 = isoPoint(x, y + 1, z, offsetX, offsetY, scale);
  const p110 = isoPoint(x + 1, y + 1, z, offsetX, offsetY, scale);
  const p001 = isoPoint(x, y, z + 1, offsetX, offsetY, scale);
  const p101 = isoPoint(x + 1, y, z + 1, offsetX, offsetY, scale);
  const p011 = isoPoint(x, y + 1, z + 1, offsetX, offsetY, scale);
  const p111 = isoPoint(x + 1, y + 1, z + 1, offsetX, offsetY, scale);

  return [
    {
      points: [p010, p110, p111, p011],
      color: shade(color, 1.15),
      depth: x + y + z + 3
    },
    {
      points: [p001, p011, p111, p101],
      color: shade(color, 0.82),
      depth: x + y + z + 2
    },
    {
      points: [p100, p110, p111, p101],
      color: shade(color, 0.96),
      depth: x + y + z + 2.1
    }
  ];
}

function collectBlocksFromStructure(structure) {
  const palette = getPalette(structure);
  const blocks = [];

  for (const block of structure.blocks ?? []) {
    const state = palette[block.state];
    const blockName = getBlockNameFromPaletteEntry(state);

    if (!blockName || IGNORED_BLOCKS.has(blockName)) continue;

    const pos = block.pos ?? block.position;
    if (!Array.isArray(pos) || pos.length < 3) continue;

    blocks.push({
      x: Number(pos[0]),
      y: Number(pos[1]),
      z: Number(pos[2]),
      name: blockName,
      color: getBlockColor(blockName)
    });
  }

  return blocks;
}

function normalizeBlocks(blocks) {
  if (blocks.length === 0) return blocks;

  const minX = Math.min(...blocks.map(b => b.x));
  const minY = Math.min(...blocks.map(b => b.y));
  const minZ = Math.min(...blocks.map(b => b.z));

  return blocks.map(block => ({
    ...block,
    x: block.x - minX,
    y: block.y - minY,
    z: block.z - minZ
  }));
}

function computeBounds(blocks, scale = 1) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const update = point => {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  };

  for (const block of blocks) {
    update(isoPoint(block.x, block.y, block.z, 0, 0, scale));
    update(isoPoint(block.x + 1, block.y, block.z, 0, 0, scale));
    update(isoPoint(block.x, block.y + 1, block.z, 0, 0, scale));
    update(isoPoint(block.x + 1, block.y + 1, block.z, 0, 0, scale));
    update(isoPoint(block.x, block.y, block.z + 1, 0, 0, scale));
    update(isoPoint(block.x + 1, block.y, block.z + 1, 0, 0, scale));
    update(isoPoint(block.x, block.y + 1, block.z + 1, 0, 0, scale));
    update(isoPoint(block.x + 1, block.y + 1, block.z + 1, 0, 0, scale));
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  return { minX, maxX, minY, maxY };
}

function fillBackground(png) {
  if (transparentBackground) return;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      drawPixel(png, x, y, "#101820", 255);
    }
  }
}

function renderBlocksToPng(blocks) {
  blocks = normalizeBlocks(blocks);

  if (blocks.length === 0) {
    const png = new PNG({ width: 32, height: 32 });
    fillBackground(png);
    return PNG.sync.write(png);
  }

  const baseBounds = computeBounds(blocks, 1);
  const baseWidth = baseBounds.maxX - baseBounds.minX + padding * 2;
  const baseHeight = baseBounds.maxY - baseBounds.minY + padding * 2;

  const scale = Math.min(1, maxImageSize / Math.max(baseWidth, baseHeight));
  const bounds = computeBounds(blocks, scale);

  const width = Math.max(1, Math.ceil(bounds.maxX - bounds.minX + padding * 2));
  const height = Math.max(1, Math.ceil(bounds.maxY - bounds.minY + padding * 2));

  const png = new PNG({ width, height });
  fillBackground(png);

  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;

  const faces = [];
  for (const block of blocks) {
    faces.push(...makeCubeFaces(block, offsetX, offsetY, scale));
  }

  faces.sort((a, b) => a.depth - b.depth);

  for (const face of faces) {
    drawPolygon(png, face.points, face.color, 255);
  }

  return PNG.sync.write(png);
}

async function loadBlocksForFiles(files) {
  const allBlocks = [];

  for (const file of files) {
    const structure = await readNbtFile(file);
    allBlocks.push(...collectBlocksFromStructure(structure));
  }

  return allBlocks;
}

function removeStaleOutputFiles(validOutputFiles) {
  if (!fs.existsSync(outputRoot)) return;

  for (const file of walk(outputRoot).filter(file => file.endsWith(".png"))) {
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

    groups.get(key).files.push(file);
  }

  const validOutputFiles = new Set();

  for (const group of groups.values()) {
    group.files.sort();

    const blocks = await loadBlocksForFiles(group.files);
    const outputPath = path.join(outputRoot, group.namespace, `${group.topFolder}.png`);

    validOutputFiles.add(path.normalize(outputPath));

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, renderBlocksToPng(blocks));

    console.log(`Generated ${outputPath} from ${group.files.length} structure part(s)`);
  }

  removeStaleOutputFiles(validOutputFiles);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
