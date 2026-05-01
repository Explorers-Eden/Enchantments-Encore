// scripts/generate-structure-previews.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const nbt = require("prismarine-nbt");
const { PNG } = require("pngjs");

const inputRoot = process.env.STRUCTURE_INPUT_ROOT ?? "data";
const outputRoot = process.env.STRUCTURE_PREVIEW_OUTPUT_ROOT ?? path.join("wiki", "images", "structures");
const vanillaAssetRoot = process.env.VANILLA_ASSET_ROOT ?? path.join(".cache", "vanilla-assets");

const generateCenterView = String(process.env.STRUCTURE_PREVIEW_CENTER_VIEW ?? "true") !== "false";
const centerViewSuffix = process.env.STRUCTURE_PREVIEW_CENTER_SUFFIX ?? "-center";

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

const zipEntryCache = new Map();
const modelCache = new Map();
const textureCache = new Map();
const fallbackColorCache = new Map();

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

function splitResourceLocation(id, defaultNamespace = "minecraft") {
  if (String(id).includes(":")) {
    const [namespace, ...rest] = String(id).split(":");
    return [namespace, rest.join(":")];
  }

  return [defaultNamespace, String(id)];
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

function getVanillaClientJar() {
  if (!fs.existsSync(vanillaAssetRoot)) return null;

  const direct = walk(vanillaAssetRoot).find(file => file.endsWith("client.jar"));
  return direct ?? null;
}

function readZipEntries(zipFile) {
  if (zipEntryCache.has(zipFile)) return zipEntryCache.get(zipFile);

  const buffer = fs.readFileSync(zipFile);
  const entries = new Map();
  let offset = 0;

  while (offset < buffer.length - 30) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileName = buffer.slice(offset + 30, offset + 30 + fileNameLength).toString("utf8");
    const dataStart = offset + 30 + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    if (!fileName.endsWith("/")) {
      entries.set(fileName, {
        compressionMethod,
        data: buffer.slice(dataStart, dataEnd)
      });
    }

    offset = dataEnd;
  }

  zipEntryCache.set(zipFile, entries);
  return entries;
}

function readZipFile(zipFile, entryName) {
  if (!zipFile || !fs.existsSync(zipFile)) return null;

  const entry = readZipEntries(zipFile).get(entryName);
  if (!entry) return null;

  if (entry.compressionMethod === 0) return entry.data;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(entry.data);

  return null;
}

function readAssetBuffer(assetPath) {
  const local = path.join(...assetPath.split("/"));
  if (fs.existsSync(local)) return fs.readFileSync(local);

  const jar = getVanillaClientJar();
  if (!jar) return null;

  return readZipFile(jar, assetPath);
}

function readJsonAsset(assetPath) {
  if (modelCache.has(assetPath)) return modelCache.get(assetPath);

  const buffer = readAssetBuffer(assetPath);
  if (!buffer) {
    modelCache.set(assetPath, null);
    return null;
  }

  try {
    const json = JSON.parse(buffer.toString("utf8"));
    modelCache.set(assetPath, json);
    return json;
  } catch {
    modelCache.set(assetPath, null);
    return null;
  }
}

function readTextureAsset(assetPath) {
  if (textureCache.has(assetPath)) return textureCache.get(assetPath);

  const buffer = readAssetBuffer(assetPath);
  if (!buffer) {
    textureCache.set(assetPath, null);
    return null;
  }

  try {
    const png = PNG.sync.read(buffer);
    textureCache.set(assetPath, png);
    return png;
  } catch {
    textureCache.set(assetPath, null);
    return null;
  }
}

function resolveTextureReference(textureRef, textures = {}) {
  let current = textureRef;

  for (let i = 0; i < 16; i++) {
    if (!current || typeof current !== "string") return null;

    if (current.startsWith("#")) {
      current = textures[current.slice(1)];
      continue;
    }

    return current;
  }

  return null;
}

function mergeModelTextures(modelId, seen = new Set()) {
  const [namespace, modelPath] = splitResourceLocation(modelId);
  const key = `${namespace}:${modelPath}`;

  if (seen.has(key)) return {};
  seen.add(key);

  const model = readJsonAsset(`assets/${namespace}/models/${modelPath}.json`);
  if (!model) return {};

  const textures = {};

  if (model.parent) {
    Object.assign(textures, mergeModelTextures(model.parent, seen));
  }

  Object.assign(textures, model.textures ?? {});
  return textures;
}

function getTextureIdForBlock(blockName, face) {
  const [namespace, blockPath] = splitResourceLocation(blockName);
  const modelId = `${namespace}:block/${blockPath}`;
  const textures = mergeModelTextures(modelId);

  const preferred =
    (face === "top" ? textures.top : null) ??
    (face === "left" || face === "right" ? textures.side : null) ??
    textures.all ??
    textures.side ??
    textures.end ??
    textures.front ??
    textures.north ??
    textures.south ??
    textures.east ??
    textures.west ??
    textures.particle ??
    Object.values(textures).find(value => typeof value === "string") ??
    null;

  return resolveTextureReference(preferred, textures);
}

function getTextureForBlockFace(blockName, face) {
  const textureId = getTextureIdForBlock(blockName, face);
  if (!textureId) return null;

  const [namespace, texturePath] = splitResourceLocation(textureId);
  return readTextureAsset(`assets/${namespace}/textures/${texturePath}.png`);
}

function hashColor(text) {
  if (fallbackColorCache.has(text)) return fallbackColorCache.get(text);

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 28 + (Math.abs(hash >> 8) % 28);
  const lightness = 45 + (Math.abs(hash >> 16) % 18);
  const color = hslToRgb(hue, saturation, lightness);

  fallbackColorCache.set(text, color);
  return color;
}

function hslToRgb(h, s, l) {
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

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function fallbackColorForBlock(blockName) {
  const short = blockName.replace(/^minecraft:/, "");

  if (short.includes("leaves")) return { r: 79, g: 140, b: 58 };
  if (short.includes("grass") || short.includes("moss")) return { r: 102, g: 138, b: 58 };
  if (short.includes("dirt") || short.includes("mud")) return { r: 121, g: 83, b: 58 };
  if (short.includes("spruce")) return { r: 122, g: 83, b: 48 };
  if (short.includes("oak")) return { r: 185, g: 139, b: 75 };
  if (short.includes("log") || short.includes("wood") || short.includes("planks")) return { r: 138, g: 90, b: 47 };
  if (short.includes("deepslate") || short.includes("blackstone") || short.includes("basalt")) return { r: 63, g: 65, b: 72 };
  if (short.includes("stone") || short.includes("tuff") || short.includes("andesite")) return { r: 119, g: 119, b: 119 };
  if (short.includes("sand")) return { r: 214, g: 194, b: 122 };
  if (short.includes("amethyst") || short.includes("purple")) return { r: 143, g: 104, b: 200 };
  if (short.includes("water")) return { r: 61, g: 117, b: 196 };
  if (short.includes("lava")) return { r: 230, g: 90, b: 30 };
  if (short.includes("glass")) return { r: 158, g: 208, b: 221 };
  if (short.includes("copper")) return { r: 184, g: 121, b: 83 };
  if (short.includes("bookshelf") || short.includes("lectern")) return { r: 154, g: 106, b: 50 };
  if (short.includes("chest") || short.includes("barrel")) return { r: 176, g: 111, b: 40 };

  return hashColor(blockName);
}

function sampleTexture(texture, u, v) {
  if (!texture) return null;

  const x = Math.max(0, Math.min(texture.width - 1, Math.floor(u * texture.width)));
  const y = Math.max(0, Math.min(texture.height - 1, Math.floor(v * texture.height)));
  const idx = (texture.width * y + x) << 2;
  const alpha = texture.data[idx + 3];

  if (alpha < 16) return null;

  return {
    r: texture.data[idx],
    g: texture.data[idx + 1],
    b: texture.data[idx + 2],
    a: alpha
  };
}

function shadeColor(color, factor) {
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r * factor))),
    g: Math.max(0, Math.min(255, Math.round(color.g * factor))),
    b: Math.max(0, Math.min(255, Math.round(color.b * factor))),
    a: color.a ?? 255
  };
}

function blendPixel(png, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);

  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;

  const idx = (png.width * y + x) << 2;
  const alpha = (color.a ?? 255) / 255;

  if (alpha >= 1 || png.data[idx + 3] === 0) {
    png.data[idx] = color.r;
    png.data[idx + 1] = color.g;
    png.data[idx + 2] = color.b;
    png.data[idx + 3] = Math.round(alpha * 255);
    return;
  }

  const existingAlpha = png.data[idx + 3] / 255;
  const outAlpha = alpha + existingAlpha * (1 - alpha);

  png.data[idx] = Math.round((color.r * alpha + png.data[idx] * existingAlpha * (1 - alpha)) / outAlpha);
  png.data[idx + 1] = Math.round((color.g * alpha + png.data[idx + 1] * existingAlpha * (1 - alpha)) / outAlpha);
  png.data[idx + 2] = Math.round((color.b * alpha + png.data[idx + 2] * existingAlpha * (1 - alpha)) / outAlpha);
  png.data[idx + 3] = Math.round(outAlpha * 255);
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

function bilinearPoint(points, u, v) {
  const [p00, p10, p11, p01] = points;

  const top = {
    x: p00.x + (p10.x - p00.x) * u,
    y: p00.y + (p10.y - p00.y) * u
  };

  const bottom = {
    x: p01.x + (p11.x - p01.x) * u,
    y: p01.y + (p11.y - p01.y) * u
  };

  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v
  };
}

function drawTexturedPolygon(png, face) {
  const points = face.points;
  const minY = Math.floor(Math.min(...points.map(p => p.y)));
  const maxY = Math.ceil(Math.max(...points.map(p => p.y)));
  const minX = Math.floor(Math.min(...points.map(p => p.x)));
  const maxX = Math.ceil(Math.max(...points.map(p => p.x)));

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const texture = getTextureForBlockFace(face.blockName, face.face);
  const fallback = fallbackColorForBlock(face.blockName);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPolygon(x + 0.5, y + 0.5, points)) continue;

      const u = Math.max(0, Math.min(1, (x - minX) / width));
      const v = Math.max(0, Math.min(1, (y - minY) / height));
      const sampled = sampleTexture(texture, u, v) ?? fallback;
      blendPixel(png, x, y, shadeColor(sampled, face.shade));
    }
  }
}

function isoPoint(x, y, z, offsetX, offsetY, scale = 1) {
  return {
    x: offsetX + (x - z) * (tileWidth / 2) * scale,
    y: offsetY + (x + z) * (tileHeight / 2) * scale - y * blockHeight * scale
  };
}

function makeCubeFaces(block, offsetX, offsetY, scale) {
  const { x, y, z, name } = block;

  const p100 = isoPoint(x + 1, y, z, offsetX, offsetY, scale);
  const p010 = isoPoint(x, y + 1, z, offsetX, offsetY, scale);
  const p110 = isoPoint(x + 1, y + 1, z, offsetX, offsetY, scale);
  const p001 = isoPoint(x, y, z + 1, offsetX, offsetY, scale);
  const p101 = isoPoint(x + 1, y, z + 1, offsetX, offsetY, scale);
  const p011 = isoPoint(x, y + 1, z + 1, offsetX, offsetY, scale);
  const p111 = isoPoint(x + 1, y + 1, z + 1, offsetX, offsetY, scale);

  return [
    {
      face: "top",
      blockName: name,
      points: [p010, p110, p111, p011],
      shade: 1.12,
      depth: x + y + z + 3
    },
    {
      face: "left",
      blockName: name,
      points: [p001, p011, p111, p101],
      shade: 0.78,
      depth: x + y + z + 2
    },
    {
      face: "right",
      blockName: name,
      points: [p100, p110, p111, p101],
      shade: 0.95,
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
      name: blockName
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
      blendPixel(png, x, y, { r: 16, g: 24, b: 32, a: 255 });
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
    drawTexturedPolygon(png, face);
  }

  return PNG.sync.write(png);
}


function getTopVisibleBlocks(blocks) {
  const topByColumn = new Map();

  for (const block of blocks) {
    const key = `${block.x},${block.z}`;
    const existing = topByColumn.get(key);

    if (!existing || block.y > existing.y) {
      topByColumn.set(key, block);
    }
  }

  return [...topByColumn.values()];
}

function renderCenterViewToPng(blocks) {
  blocks = normalizeBlocks(blocks);

  if (blocks.length === 0) {
    const png = new PNG({ width: 32, height: 32 });
    fillBackground(png);
    return PNG.sync.write(png);
  }

  const visibleBlocks = getTopVisibleBlocks(blocks);

  const minX = Math.min(...visibleBlocks.map(block => block.x));
  const maxX = Math.max(...visibleBlocks.map(block => block.x));
  const minZ = Math.min(...visibleBlocks.map(block => block.z));
  const maxZ = Math.max(...visibleBlocks.map(block => block.z));

  const structureWidth = maxX - minX + 1;
  const structureDepth = maxZ - minZ + 1;

  const baseTileSize = Number(process.env.STRUCTURE_PREVIEW_CENTER_TILE_SIZE ?? 10);
  const baseWidth = structureWidth * baseTileSize + padding * 2;
  const baseHeight = structureDepth * baseTileSize + padding * 2;
  const scale = Math.min(1, maxImageSize / Math.max(baseWidth, baseHeight));
  const tileSize = Math.max(1, Math.floor(baseTileSize * scale));

  const width = Math.max(1, structureWidth * tileSize + padding * 2);
  const height = Math.max(1, structureDepth * tileSize + padding * 2);

  const png = new PNG({ width, height });
  fillBackground(png);

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  visibleBlocks.sort((a, b) => a.y - b.y);

  for (const block of visibleBlocks) {
    const x = Math.round(width / 2 + (block.x - centerX - 0.5) * tileSize);
    const z = Math.round(height / 2 + (block.z - centerZ - 0.5) * tileSize);
    const texture = getTextureForBlockFace(block.name, "top");
    const fallback = fallbackColorForBlock(block.name);

    for (let py = 0; py < tileSize; py++) {
      for (let px = 0; px < tileSize; px++) {
        const u = tileSize <= 1 ? 0 : px / (tileSize - 1);
        const v = tileSize <= 1 ? 0 : py / (tileSize - 1);
        const sampled = sampleTexture(texture, u, v) ?? fallback;
        blendPixel(png, x + px, z + py, shadeColor(sampled, 1.08));
      }
    }
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

    if (generateCenterView) {
      const centerOutputPath = path.join(
        outputRoot,
        group.namespace,
        `${group.topFolder}${centerViewSuffix}.png`
      );

      validOutputFiles.add(path.normalize(centerOutputPath));

      fs.mkdirSync(path.dirname(centerOutputPath), { recursive: true });
      fs.writeFileSync(centerOutputPath, renderCenterViewToPng(blocks));

      console.log(`Generated ${centerOutputPath} from the structure center`);
    }
  }

  removeStaleOutputFiles(validOutputFiles);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
