// scripts/generate-structure-previews.js
const fs = require("fs");
const path = require("path");
const nbt = require("prismarine-nbt");
const { PNG } = require("pngjs");
const crypto = require("crypto");

const inputRoot = process.env.STRUCTURE_INPUT_ROOT ?? "data";
const outputRoot = process.env.STRUCTURE_PREVIEW_OUTPUT_ROOT ?? path.join("wiki", "images", "structures");
const vanillaAssetRoot = process.env.VANILLA_ASSET_ROOT ?? path.join(".cache", "vanilla-assets");
const generateWorldgenStructurePreviews = String(process.env.STRUCTURE_PREVIEW_WORLDGEN ?? "true") !== "false";

const tileWidth = Number(process.env.STRUCTURE_PREVIEW_TILE_WIDTH ?? 32);
const tileHeight = Number(process.env.STRUCTURE_PREVIEW_TILE_HEIGHT ?? 18);
const blockHeight = Number(process.env.STRUCTURE_PREVIEW_BLOCK_HEIGHT ?? 22);
const padding = Number(process.env.STRUCTURE_PREVIEW_PADDING ?? 48);
const maxImageSize = Number(process.env.STRUCTURE_PREVIEW_MAX_SIZE ?? 900);
const transparentBackground = String(process.env.STRUCTURE_PREVIEW_TRANSPARENT ?? "true") !== "false";
const pngCompressionLevel = Math.min(9, Math.max(0, Number(process.env.STRUCTURE_PREVIEW_PNG_COMPRESSION ?? 9)));
const previewSeed = String(process.env.STRUCTURE_PREVIEW_SEED ?? crypto.randomBytes(8).toString("hex"));

const previewRotations = [
  { name: "north", degrees: 0 },
  { name: "east", degrees: 90 },
  { name: "south", degrees: 180 },
  { name: "west", degrees: 270 }
];

const IGNORED_BLOCKS = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
  "minecraft:structure_void",
  "minecraft:barrier",
  "minecraft:light",
  "minecraft:water",
  "minecraft:flowing_water"
]);

// Do not invent a fake full cube when a block has no resolved model elements.
// Missing/special-rendered blocks should be omitted rather than appearing as
// bogus oak-plank/default cubes in previews.

const modelCache = new Map();
const resolvedModelCache = new Map();
const textureCache = new Map();
const bakedModelCache = new Map();
const fallbackColorCache = new Map();
const textureAverageCache = new Map();

const stats = {
  mainImages: 0,
  structuresRead: 0,
  poolsRead: 0,
  jigsawPoolsFollowed: 0,
  jigsawBlocksResolved: 0,
  textureHits: 0,
  textureMisses: 0,
  bakedQuads: 0,
  skippedMissingModels: 0
};

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

function getWorldgenStructureInfo(file) {
  const parts = file.split(path.sep);
  const dataIndex = parts.indexOf("data");
  const worldgenIndex = parts.indexOf("worldgen");
  const structureIndex = parts.indexOf("structure");

  if (dataIndex === -1 || worldgenIndex === -1 || structureIndex === -1) return null;
  if (worldgenIndex !== dataIndex + 2 || structureIndex !== worldgenIndex + 1) return null;

  const namespace = parts[dataIndex + 1];
  const relativePath = parts.slice(structureIndex + 1).join("/").replace(/\.json$/, "");

  return {
    namespace,
    id: `${namespace}:${relativePath}`,
    relativePath
  };
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
  stats.structuresRead++;
  return nbt.simplify(parsed.parsed);
}

function readAssetBuffer(assetPath) {
  const local = path.join(...assetPath.split("/"));
  if (fs.existsSync(local)) return fs.readFileSync(local);

  const vanilla = path.join(vanillaAssetRoot, ...assetPath.split("/"));
  if (fs.existsSync(vanilla)) return fs.readFileSync(vanilla);

  return null;
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
    stats.textureMisses++;
    return null;
  }

  try {
    const png = PNG.sync.read(buffer);
    textureCache.set(assetPath, png);
    stats.textureHits++;
    return png;
  } catch {
    textureCache.set(assetPath, null);
    stats.textureMisses++;
    return null;
  }
}

function stringifyProperties(properties = {}) {
  return Object.entries(properties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function parseVariantKey(key) {
  if (!key) return {};

  const result = {};
  for (const part of key.split(",")) {
    const [name, value] = part.split("=");
    if (name && value !== undefined) result[name] = value;
  }

  return result;
}

function variantMatchesBlockState(variantKey, properties = {}) {
  const variant = parseVariantKey(variantKey);

  for (const [key, value] of Object.entries(variant)) {
    if (String(properties[key]) !== String(value)) return false;
  }

  return true;
}

function whenClauseMatches(when, properties = {}) {
  if (!when) return true;

  if (Array.isArray(when.OR)) return when.OR.some(clause => whenClauseMatches(clause, properties));
  if (Array.isArray(when.AND)) return when.AND.every(clause => whenClauseMatches(clause, properties));

  for (const [key, expected] of Object.entries(when)) {
    if (key === "OR" || key === "AND") continue;

    const actual = String(properties[key]);
    const allowed = String(expected).split("|");

    if (!allowed.includes(actual)) return false;
  }

  return true;
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < String(text).length; i++) {
    hash ^= String(text).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seedText) {
  // One deterministic sample in [0, 1) for a specific choice key. The base
  // previewSeed is randomized once per run unless STRUCTURE_PREVIEW_SEED is set,
  // so weighted jigsaw and blockstate choices vary between runs but remain
  // reproducible when the logged seed is reused.
  let state = hashString(seedText) || 1;
  state = Math.imul(state ^ (state >>> 15), 0x2c1b3c6d);
  state = Math.imul(state ^ (state >>> 12), 0x297a2d39);
  state = (state ^ (state >>> 15)) >>> 0;
  return state / 4294967296;
}

function chooseWeightedEntry(entries, seedText) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  let totalWeight = 0;
  for (const entry of entries) {
    totalWeight += Math.max(0, Number(entry?.weight ?? 1));
  }

  if (totalWeight <= 0) return entries[0] ?? null;

  let roll = seededRandom(seedText) * totalWeight;
  for (const entry of entries) {
    roll -= Math.max(0, Number(entry?.weight ?? 1));
    if (roll <= 0) return entry;
  }

  return entries[entries.length - 1] ?? null;
}

function normalizeVariant(variant, seedText = previewSeed) {
  if (Array.isArray(variant)) return chooseWeightedEntry(variant, seedText);
  return variant ?? null;
}

function getModelVariantsFromBlockState(blockName, properties = {}) {
  const [namespace, blockPath] = splitResourceLocation(blockName);
  const blockState = readJsonAsset(`assets/${namespace}/blockstates/${blockPath}.json`);

  if (!blockState) {
    return [
      {
        model: `${namespace}:block/${blockPath}`,
        x: 0,
        y: 0,
        uvlock: false
      }
    ];
  }

  if (blockState.variants) {
    const exactKey = stringifyProperties(properties);
    let variant = blockState.variants[exactKey];

    if (!variant) {
      const matchingKey = Object.keys(blockState.variants).find(key =>
        variantMatchesBlockState(key, properties)
      );
      if (matchingKey) variant = blockState.variants[matchingKey];
    }

    if (!variant) variant = blockState.variants[""] ?? Object.values(blockState.variants)[0];

    variant = normalizeVariant(variant, `${previewSeed}|blockstate|${blockName}|${stringifyProperties(properties)}`);

    if (variant?.model) {
      return [
        {
          model: variant.model,
          x: Number(variant.x ?? 0),
          y: Number(variant.y ?? 0),
          z: Number(variant.z ?? 0),
          uvlock: Boolean(variant.uvlock)
        }
      ];
    }
  }

  if (Array.isArray(blockState.multipart)) {
    const variants = [];

    for (const part of blockState.multipart) {
      if (!whenClauseMatches(part.when, properties)) continue;

      const applies = Array.isArray(part.apply) ? [normalizeVariant(part.apply, `${previewSeed}|multipart|${blockName}|${stringifyProperties(properties)}|${variants.length}`)] : [part.apply];

      for (const apply of applies) {
        if (apply?.model) {
          variants.push({
            model: apply.model,
            x: Number(apply.x ?? 0),
            y: Number(apply.y ?? 0),
            z: Number(apply.z ?? 0),
            uvlock: Boolean(apply.uvlock)
          });
        }
      }
    }

    if (variants.length > 0) return variants;
  }

  return [
    {
      model: `${namespace}:block/${blockPath}`,
      x: 0,
      y: 0,
      z: 0,
      uvlock: false
    }
  ];
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

function mergeModel(modelId, seen = new Set()) {
  const [namespace, modelPath] = splitResourceLocation(modelId);
  const key = `${namespace}:${modelPath}`;

  if (resolvedModelCache.has(key)) return resolvedModelCache.get(key);
  if (seen.has(key)) return { textures: {}, elements: [] };

  seen.add(key);

  const model = readJsonAsset(`assets/${namespace}/models/${modelPath}.json`);
  if (!model) {
    const empty = { textures: {}, elements: [] };
    resolvedModelCache.set(key, empty);
    return empty;
  }

  let parent = { textures: {}, elements: [] };

  if (model.parent) {
    parent = mergeModel(model.parent, seen);
  }

  const merged = {
    textures: {
      ...parent.textures,
      ...(model.textures ?? {})
    },
    elements: model.elements ?? parent.elements ?? []
  };

  resolvedModelCache.set(key, merged);
  return merged;
}

function hashColor(text) {
  if (fallbackColorCache.has(text)) return fallbackColorCache.get(text);

  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;

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
    b: Math.round((b + m) * 255),
    a: 255
  };
}

function fallbackColorForBlock(blockName) {
  const short = blockName.replace(/^minecraft:/, "");

  if (short.includes("leaves")) return { r: 79, g: 140, b: 58, a: 190 };
  if (short.includes("grass") || short.includes("moss")) return { r: 102, g: 138, b: 58, a: 210 };
  if (short.includes("dirt") || short.includes("mud")) return { r: 121, g: 83, b: 58, a: 255 };
  if (short.includes("spruce")) return { r: 122, g: 83, b: 48, a: 255 };
  if (short.includes("oak")) return { r: 185, g: 139, b: 75, a: 255 };
  if (short.includes("log") || short.includes("wood") || short.includes("planks")) return { r: 138, g: 90, b: 47, a: 255 };
  if (short.includes("deepslate") || short.includes("blackstone") || short.includes("basalt")) return { r: 63, g: 65, b: 72, a: 255 };
  if (short.includes("stone") || short.includes("tuff") || short.includes("andesite")) return { r: 119, g: 119, b: 119, a: 255 };
  if (short.includes("sand")) return { r: 214, g: 194, b: 122, a: 255 };
  if (short.includes("amethyst") || short.includes("purple")) return { r: 143, g: 104, b: 200, a: 255 };
  if (short.includes("water")) return { r: 61, g: 117, b: 196, a: 145 };
  if (short.includes("lava")) return { r: 230, g: 90, b: 30, a: 255 };
  if (short.includes("glass")) return { r: 158, g: 208, b: 221, a: 120 };
  if (short.includes("copper")) return { r: 184, g: 121, b: 83, a: 255 };
  if (short.includes("bookshelf") || short.includes("lectern")) return { r: 154, g: 106, b: 50, a: 255 };
  if (short.includes("chest") || short.includes("barrel")) return { r: 176, g: 111, b: 40, a: 255 };

  return hashColor(blockName);
}

const PLAINS_GRASS_TINT = { r: 145, g: 189, b: 89 };
const PLAINS_FOLIAGE_TINT = { r: 119, g: 171, b: 47 };

function multiplyTint(color, tint) {
  return {
    r: Math.round((color.r * tint.r) / 255),
    g: Math.round((color.g * tint.g) / 255),
    b: Math.round((color.b * tint.b) / 255),
    a: color.a ?? 255
  };
}

function needsPlainsGrassTint(blockName, faceName) {
  const short = blockName.replace(/^minecraft:/, "");
  if (short === "grass_block") return faceName === "up";
  if (short === "short_grass" || short === "tall_grass" || short === "fern" || short === "large_fern") return true;
  return short.includes("grass") && !short.includes("grass_block_side");
}

function needsPlainsFoliageTint(blockName) {
  const short = blockName.replace(/^minecraft:/, "");
  return short.includes("leaves") || short === "vine" || short === "cave_vines" || short === "hanging_roots";
}

function applyBiomeTint(color, blockName, faceName) {
  if (needsPlainsGrassTint(blockName, faceName)) return multiplyTint(color, PLAINS_GRASS_TINT);
  if (needsPlainsFoliageTint(blockName)) return multiplyTint(color, PLAINS_FOLIAGE_TINT);
  return color;
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

function averageOpaqueTextureColor(texture) {
  if (!texture) return null;
  if (textureAverageCache.has(texture)) return textureAverageCache.get(texture);

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = 0; y < texture.height; y++) {
    for (let x = 0; x < texture.width; x++) {
      const idx = (texture.width * y + x) << 2;
      const alpha = texture.data[idx + 3];
      if (alpha < 16) continue;
      r += texture.data[idx];
      g += texture.data[idx + 1];
      b += texture.data[idx + 2];
      a += alpha;
      count++;
    }
  }

  const color = count > 0
    ? { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count), a: Math.round(a / count) }
    : null;

  textureAverageCache.set(texture, color);
  return color;
}

function sampleTextureForQuad(quad, u, v) {
  const sampled = sampleTexture(quad.texture, u, v);
  if (sampled) return sampled;

  // Chain uses a mostly-transparent texture on very thin geometry. In a tiny
  // isometric preview, exact nearest-neighbor samples often land in transparent
  // holes, making the whole chain disappear. Keep the vanilla model/texture,
  // but use the texture's opaque average for transparent chain samples so the
  // chain remains visible rather than being skipped.
  if (quad.blockName === "minecraft:chain" && quad.texture) {
    return averageOpaqueTextureColor(quad.texture);
  }

  return null;
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

function dot2(a, b) {
  return a.x * b.x + a.y * b.y;
}

function solve2d(origin, uPoint, vPoint, x, y) {
  const uAxis = { x: uPoint.x - origin.x, y: uPoint.y - origin.y };
  const vAxis = { x: vPoint.x - origin.x, y: vPoint.y - origin.y };
  const point = { x: x - origin.x, y: y - origin.y };

  const uu = dot2(uAxis, uAxis);
  const uv = dot2(uAxis, vAxis);
  const vv = dot2(vAxis, vAxis);
  const pu = dot2(point, uAxis);
  const pv = dot2(point, vAxis);
  const det = uu * vv - uv * uv;

  if (Math.abs(det) < 0.000001) return { u: 0, v: 0 };

  return {
    u: Math.max(0, Math.min(1, (pu * vv - pv * uv) / det)),
    v: Math.max(0, Math.min(1, (pv * uu - pu * uv) / det))
  };
}

function getFaceUv(face, localU, localV) {
  const uv = face.uv ?? [0, 0, 16, 16];

  const u0 = uv[0] / 16;
  const v0 = uv[1] / 16;
  const u1 = uv[2] / 16;
  const v1 = uv[3] / 16;

  let u = localU;
  let v = localV;

  const rotation = ((face.uvRotation ?? 0) % 360 + 360) % 360;

  if (rotation === 90) {
    [u, v] = [v, 1 - u];
  } else if (rotation === 180) {
    [u, v] = [1 - u, 1 - v];
  } else if (rotation === 270) {
    [u, v] = [1 - v, u];
  }

  return {
    u: u0 + (u1 - u0) * u,
    v: v0 + (v1 - v0) * v
  };
}

function drawTexturedQuad(png, quad) {
  const points = quad.screen;
  const minY = Math.floor(Math.min(...points.map(p => p.y)));
  const maxY = Math.ceil(Math.max(...points.map(p => p.y)));
  const minX = Math.floor(Math.min(...points.map(p => p.x)));
  const maxX = Math.ceil(Math.max(...points.map(p => p.x)));

  const texture = quad.texture;
  const fallback = fallbackColorForBlock(quad.blockName);

  // Because this renderer is orthographic/isometric, affine UV interpolation is
  // stable. This uses baked model-space UV axes rather than ad-hoc screen axes.
  const [p00, p10, , p01] = points;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPolygon(x + 0.5, y + 0.5, points)) continue;

      const local = solve2d(p00, p10, p01, x + 0.5, y + 0.5);
      const uv = getFaceUv(quad, local.u, local.v);
      const sampled = sampleTextureForQuad(quad, uv.u, uv.v);

      if (texture && !sampled) continue;

      const base = sampled ?? fallback;
      const tinted = applyBiomeTint(base, quad.blockName, quad.faceName);
      blendPixel(png, x, y, shadeColor(tinted, quad.shade));
    }
  }
}

function rotatePointAroundOrigin(point, origin, axis, angleDegrees, rescale = false) {
  if (!angleDegrees) return point;

  const angle = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  let x = point.x - origin.x;
  let y = point.y - origin.y;
  let z = point.z - origin.z;

  if (axis === "x") {
    const y2 = y * cos - z * sin;
    const z2 = y * sin + z * cos;
    y = y2;
    z = z2;
  } else if (axis === "y") {
    const x2 = x * cos - z * sin;
    const z2 = x * sin + z * cos;
    x = x2;
    z = z2;
  } else if (axis === "z") {
    const x2 = x * cos - y * sin;
    const y2 = x * sin + y * cos;
    x = x2;
    y = y2;
  }

  const scale = rescale ? 1 / Math.max(Math.abs(cos), Math.abs(sin), 0.0001) : 1;

  return {
    x: origin.x + x * scale,
    y: origin.y + y * scale,
    z: origin.z + z * scale
  };
}

function applyElementRotation(point, element) {
  const rotation = element.rotation;
  if (!rotation) return point;

  const origin = {
    x: (rotation.origin?.[0] ?? 8) / 16,
    y: (rotation.origin?.[1] ?? 8) / 16,
    z: (rotation.origin?.[2] ?? 8) / 16
  };

  return rotatePointAroundOrigin(
    point,
    origin,
    rotation.axis ?? "y",
    Number(rotation.angle ?? 0),
    Boolean(rotation.rescale)
  );
}

function applyBlockstateRotation(point, rotation) {
  let rotated = point;
  const center = { x: 0.5, y: 0.5, z: 0.5 };

  if (rotation.x) rotated = rotatePointAroundOrigin(rotated, center, "x", rotation.x, false);
  if (rotation.y) rotated = rotatePointAroundOrigin(rotated, center, "y", rotation.y, false);
  if (rotation.z) rotated = rotatePointAroundOrigin(rotated, center, "z", rotation.z, false);

  return rotated;
}

function rotateWorldPoint(point, rotationDegrees, center = { x: 0, z: 0 }) {
  if (!rotationDegrees) return point;

  const angle = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point.x - center.x;
  const z = point.z - center.z;

  return {
    ...point,
    x: center.x + x * cos - z * sin,
    z: center.z + x * sin + z * cos
  };
}

function isoPoint(x, y, z, offsetX, offsetY, scale = 1) {
  return {
    x: offsetX + (x - z) * (tileWidth / 2) * scale,
    y: offsetY + (x + z) * (tileHeight / 2) * scale - y * blockHeight * scale
  };
}

function projectPoint(point, offsetX, offsetY, scale, rotation = null) {
  const rotated = rotation ? rotateWorldPoint(point, rotation.degrees, rotation.center) : point;
  return isoPoint(rotated.x, rotated.y, rotated.z, offsetX, offsetY, scale);
}

function faceShade(faceName) {
  if (faceName === "up") return 1.15;
  if (faceName === "down") return 0.68;
  if (faceName === "north" || faceName === "south") return 0.82;
  if (faceName === "east" || faceName === "west") return 0.96;
  return 1.0;
}

function faceDepth(points3d) {
  return points3d.reduce((sum, point) => sum + point.x + point.y + point.z, 0) / points3d.length;
}

function defaultFaceUv(faceName, from, to) {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;

  switch (faceName) {
    case "up":
    case "down":
      return [x0, z0, x1, z1];
    case "north":
    case "south":
      return [x0, 16 - y1, x1, 16 - y0];
    case "west":
    case "east":
      return [z0, 16 - y1, z1, 16 - y0];
    default:
      return [0, 0, 16, 16];
  }
}

function getTextureForFace(modelTextures, faceData, faceName) {
  const textureRef =
    faceData?.texture ??
    modelTextures[faceName] ??
    modelTextures.all ??
    modelTextures.side ??
    modelTextures.particle;

  const textureId = resolveTextureReference(textureRef, modelTextures);
  if (!textureId) return null;

  const [namespace, texturePath] = splitResourceLocation(textureId);
  return readTextureAsset(`assets/${namespace}/textures/${texturePath}.png`);
}

function createFaceDefinition(faceName, from, to) {
  const [x0, y0, z0] = from.map(value => value / 16);
  const [x1, y1, z1] = to.map(value => value / 16);

  // Point order is always local UV order:
  // p00 = top-left/origin for texture, p10 = +U, p11 = +U+V, p01 = +V.
  // This is the important change: model baking owns texture axes before the
  // isometric projection sees the face.
  const defs = {
    up: [
      { x: x0, y: y1, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 }
    ],
    down: [
      { x: x0, y: y0, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y0, z: z0 },
      { x: x0, y: y0, z: z0 }
    ],
    // Vertical faces are ordered as Minecraft's model baker sees them from
    // outside the block: p00 is the texture's top-left corner, p10 is +U,
    // p01 is +V/down. The previous order used the isometric screen-facing
    // left/right direction, which mirrored/rotated side textures after block
    // state y-rotations.
    north: [
      { x: x1, y: y1, z: z0 },
      { x: x0, y: y1, z: z0 },
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 }
    ],
    south: [
      { x: x0, y: y1, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x0, y: y0, z: z1 }
    ],
    west: [
      { x: x0, y: y1, z: z0 },
      { x: x0, y: y1, z: z1 },
      { x: x0, y: y0, z: z1 },
      { x: x0, y: y0, z: z0 }
    ],
    east: [
      { x: x1, y: y1, z: z1 },
      { x: x1, y: y1, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y0, z: z1 }
    ]
  };

  return defs[faceName] ?? null;
}

function bakeElementQuads(blockName, modelTextures, element, variant) {
  const from = element.from ?? [0, 0, 0];
  const to = element.to ?? [16, 16, 16];
  const quads = [];

  for (const faceName of ["up", "down", "north", "south", "west", "east"]) {
    const rawFaceData = element.faces?.[faceName];
    if (!rawFaceData) continue;

    const localPoints = createFaceDefinition(faceName, from, to);
    if (!localPoints) continue;

    const faceData = {
      ...rawFaceData,
      uv: rawFaceData.uv ?? defaultFaceUv(faceName, from, to)
    };

    const transformed = localPoints.map(point =>
      applyBlockstateRotation(applyElementRotation(point, element), {
        x: variant.x ?? 0,
        y: variant.y ?? 0,
        z: variant.z ?? 0
      })
    );

    quads.push({
      blockName,
      faceName,
      points: transformed,
      texture: getTextureForFace(modelTextures, faceData, faceName),
      uv: faceData.uv,
      uvRotation: faceData.rotation ?? 0,
      shade: faceShade(faceName),
      depthOffset: faceDepth(transformed)
    });
  }

  return quads;
}


function allFaces(texture = null) {
  const face = texture ? { texture } : {};
  return { up: face, down: face, north: face, south: face, west: face, east: face };
}

function bakeFallbackElements(blockName, elements, variant = { x: 0, y: 0, z: 0 }) {
  const baked = [];
  for (const element of elements) baked.push(...bakeElementQuads(blockName, {}, element, variant));
  return baked;
}

function blockTextureForButton(short) {
  if (short === "stone_button") return "minecraft:block/stone";
  if (short === "polished_blackstone_button") return "minecraft:block/polished_blackstone";
  if (short.endsWith("_button")) {
    const wood = short.replace(/_button$/, "");
    if (["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "bamboo", "pale_oak"].includes(wood)) {
      return `minecraft:block/${wood}_planks`;
    }
    if (wood === "crimson" || wood === "warped") return `minecraft:block/${wood}_planks`;
  }
  return "minecraft:block/stone";
}

function yRotationForFacing(facing, base = "north") {
  const order = ["north", "east", "south", "west"];
  const from = order.indexOf(base);
  const to = order.indexOf(facing);
  if (from === -1 || to === -1) return 0;
  return ((to - from + 4) % 4) * 90;
}

function cuboid(from, to, texture) {
  return { from, to, faces: allFaces(texture) };
}

function wallAttachmentCuboid(facing, depth, y0, y1, inset0, inset1, texture) {
  // For wall-attached blocks, the blockstate `facing` is the direction the
  // button/lever faces. The solid support is behind it, i.e. on the opposite
  // side of this block's local cube. So a north-facing button is drawn on the
  // south edge of the button block, not the north edge.
  switch (facing) {
    case "south":
      return cuboid([inset0, y0, 0], [inset1, y1, depth], texture);
    case "east":
      return cuboid([0, y0, inset0], [depth, y1, inset1], texture);
    case "west":
      return cuboid([16 - depth, y0, inset0], [16, y1, inset1], texture);
    case "north":
    default:
      return cuboid([inset0, y0, 16 - depth], [inset1, y1, 16], texture);
  }
}

function wallLeverHandleCuboid(facing, powered, texture) {
  // A compact cuboid handle that stays connected to the wall base plate. It is
  // approximate but deliberately attached to the same opposite-side support as
  // the base instead of being rotated onto the outside of the block.
  if (facing === "south") {
    return powered ? cuboid([7, 5, 2], [9, 7, 8], texture) : cuboid([7, 7, 2], [9, 13, 4], texture);
  }
  if (facing === "east") {
    return powered ? cuboid([2, 5, 7], [8, 7, 9], texture) : cuboid([2, 7, 7], [4, 13, 9], texture);
  }
  if (facing === "west") {
    return powered ? cuboid([8, 5, 7], [14, 7, 9], texture) : cuboid([12, 7, 7], [14, 13, 9], texture);
  }
  return powered ? cuboid([7, 5, 8], [9, 7, 14], texture) : cuboid([7, 7, 12], [9, 13, 14], texture);
}

function buttonElementsForState(properties, texture) {
  const face = properties.face ?? "wall";
  const facing = properties.facing ?? "north";
  const powered = String(properties.powered ?? "false") === "true";
  const depth = powered ? 1 : 2;

  if (face === "floor") {
    return {
      elements: [cuboid([5, 0, 5], [11, depth, 11], texture)],
      variant: { x: 0, y: yRotationForFacing(facing), z: 0 }
    };
  }

  if (face === "ceiling") {
    return {
      elements: [cuboid([5, 16 - depth, 5], [11, 16, 11], texture)],
      variant: { x: 0, y: yRotationForFacing(facing), z: 0 }
    };
  }

  return {
    elements: [wallAttachmentCuboid(facing, depth, 6, 10, 5, 11, texture)],
    variant: { x: 0, y: 0, z: 0 }
  };
}

function leverElementsForState(properties) {
  const face = properties.face ?? "wall";
  const facing = properties.facing ?? "north";
  const powered = String(properties.powered ?? "false") === "true";
  const baseTexture = "minecraft:block/cobblestone";
  const handleTexture = "minecraft:block/lever";

  if (face === "floor") {
    return {
      elements: [
        cuboid([5, 0, 5], [11, 2, 11], baseTexture),
        cuboid(powered ? [7, 2, 4] : [7, 2, 7], powered ? [9, 9, 6] : [9, 10, 9], handleTexture)
      ],
      variant: { x: 0, y: yRotationForFacing(facing), z: 0 }
    };
  }

  if (face === "ceiling") {
    return {
      elements: [
        cuboid([5, 14, 5], [11, 16, 11], baseTexture),
        cuboid(powered ? [7, 7, 4] : [7, 6, 7], powered ? [9, 14, 6] : [9, 14, 9], handleTexture)
      ],
      variant: { x: 0, y: yRotationForFacing(facing), z: 0 }
    };
  }

  const elements = [
    wallAttachmentCuboid(facing, 2, 4, 12, 5, 11, baseTexture),
    wallLeverHandleCuboid(facing, powered, handleTexture)
  ];

  return { elements, variant: { x: 0, y: 0, z: 0 } };
}

function chainElementsForState(properties) {
  const texture = "minecraft:block/chain";
  const axis = properties.axis ?? "y";

  // Crossed, very thin cuboids using the actual vanilla chain texture. These
  // are intentionally slim so lantern chains read as chains instead of as thick
  // posts, and they still render even when the generic transparent model baker
  // misses the vanilla chain model.
  const elements = [
    cuboid([6.75, 0, 7.25], [9.25, 16, 8.75], texture),
    cuboid([7.25, 0, 6.75], [8.75, 16, 9.25], texture)
  ];

  if (axis === "x") return { elements, variant: { x: 0, y: 0, z: 90 } };
  if (axis === "z") return { elements, variant: { x: 90, y: 0, z: 0 } };
  return { elements, variant: { x: 0, y: 0, z: 0 } };
}

function specialBlockModel(blockName, properties = {}) {
  const short = blockName.replace(/^minecraft:/, "");

  // Keep true special fallbacks only for blocks that do not have useful vanilla
  // model geometry in the asset baker. Directional/thin blocks such as chains,
  // buttons, and levers intentionally go through vanilla blockstates/models so
  // their rotations, UVs, and textures come from Minecraft's own data.
  if (short === "chain") {
    const chain = chainElementsForState(properties);
    return bakeFallbackElements(blockName, chain.elements, chain.variant);
  }

  if (short.endsWith("_wall_sign") || short.endsWith("_wall_hanging_sign")) {
    const y = { south: 0, west: 90, north: 180, east: 270 }[properties.facing ?? "north"] ?? 180;
    return bakeFallbackElements(blockName, [
      { from: [2, 4, 14], to: [14, 12, 15.5], faces: allFaces() }
    ], { x: 0, y });
  }

  if (short.endsWith("_sign") || short.endsWith("_hanging_sign")) {
    const rotation = Number(properties.rotation ?? 0);
    const y = (rotation / 16) * 360;
    return bakeFallbackElements(blockName, [
      { from: [2, 5, 7.25], to: [14, 13, 8.75], faces: allFaces() },
      { from: [7.25, 0, 7.25], to: [8.75, 5, 8.75], faces: allFaces() }
    ], { x: 0, y });
  }

  return null;
}

function getAttachmentSnap(blockName, properties = {}) {
  const short = blockName.replace(/^minecraft:/, "");
  if (!(short === "lever" || short.endsWith("_button"))) return null;

  const face = properties.face ?? "wall";
  const facing = properties.facing ?? "north";

  if (face === "floor") return { axis: "y", side: "min" };
  if (face === "ceiling") return { axis: "y", side: "max" };

  switch (facing) {
    case "south": return { axis: "z", side: "min" };
    case "east": return { axis: "x", side: "min" };
    case "west": return { axis: "x", side: "max" };
    case "north":
    default: return { axis: "z", side: "max" };
  }
}

function snapAttachedModelToSupport(blockName, properties, quads) {
  const snap = getAttachmentSnap(blockName, properties);
  if (!snap || quads.length === 0) return quads;

  let min = Infinity;
  let max = -Infinity;
  for (const quad of quads) {
    for (const point of quad.points) {
      const value = point[snap.axis];
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return quads;

  const target = snap.side === "min" ? 0 : 1;
  const current = snap.side === "min" ? min : max;
  const delta = target - current;
  if (Math.abs(delta) < 0.0001) return quads;

  return quads.map(quad => ({
    ...quad,
    points: quad.points.map(point => ({ ...point, [snap.axis]: point[snap.axis] + delta })),
    depthOffset: faceDepth(quad.points.map(point => ({ ...point, [snap.axis]: point[snap.axis] + delta })))
  }));
}

function bakeBlockModel(blockName, properties = {}) {
  const cacheKey = `${blockName}|${stringifyProperties(properties)}`;

  if (bakedModelCache.has(cacheKey)) return bakedModelCache.get(cacheKey);

  const special = specialBlockModel(blockName, properties);
  if (special) {
    bakedModelCache.set(cacheKey, special);
    stats.bakedQuads += special.length;
    return special;
  }

  const variants = getModelVariantsFromBlockState(blockName, properties);
  const baked = [];

  for (const variant of variants) {
    const model = mergeModel(variant.model);
    const elements = model.elements ?? [];

    if (elements.length === 0) {
      stats.skippedMissingModels++;
      continue;
    }

    for (const element of elements) {
      baked.push(...bakeElementQuads(blockName, model.textures, element, variant));
    }
  }

  const attached = snapAttachedModelToSupport(blockName, properties, baked);
  stats.bakedQuads += attached.length;
  bakedModelCache.set(cacheKey, attached);
  return attached;
}

function makeBlockQuads(block, offsetX, offsetY, scale, rotation = null) {
  const bakedModel = bakeBlockModel(block.name, block.properties);
  const quads = [];

  for (const bakedQuad of bakedModel) {
    const worldPoints = bakedQuad.points.map(point => ({
      x: block.x + point.x,
      y: block.y + point.y,
      z: block.z + point.z
    }));

    quads.push({
      ...bakedQuad,
      blockName: block.name,
      block,
      screen: worldPoints.map(point => projectPoint(point, offsetX, offsetY, scale, rotation)),
      depth: worldPoints
        .map(point => (rotation ? rotateWorldPoint(point, rotation.degrees, rotation.center) : point))
        .reduce((sum, point) => sum + point.x + point.y + point.z, 0) / worldPoints.length
    });
  }

  return quads;
}

function parseBlockStateString(state) {
  if (!state || typeof state !== "string") return null;

  const match = state.match(/^([^[]+)(?:\[(.*)\])?$/);
  if (!match) return null;

  const name = match[1];
  const properties = {};

  if (match[2]) {
    for (const part of match[2].split(",")) {
      const [key, value] = part.split("=");
      if (key && value !== undefined) properties[key] = value;
    }
  }

  return { name, properties };
}

function getJigsawReplacement(block) {
  const nbtData = block.nbt;
  if (!nbtData || typeof nbtData !== "object") return null;

  const finalState =
    nbtData.final_state ??
    nbtData.finalState ??
    nbtData.FinalState;

  const parsed = parseBlockStateString(finalState);
  if (!parsed || parsed.name === "minecraft:air") return null;

  return parsed;
}

function collectBlocksFromStructure(structure) {
  const palette = getPalette(structure);
  const blocks = [];

  for (const block of structure.blocks ?? []) {
    const state = palette[block.state];
    let blockName = getBlockNameFromPaletteEntry(state);
    let properties = state?.Properties ?? state?.properties ?? {};

    if (blockName === "minecraft:jigsaw") {
      const replacement = getJigsawReplacement(block);
      if (!replacement) continue;

      blockName = replacement.name;
      properties = replacement.properties;
    }

    if (!blockName || IGNORED_BLOCKS.has(blockName)) continue;

    const pos = block.pos ?? block.position;
    if (!Array.isArray(pos) || pos.length < 3) continue;

    blocks.push({
      x: Number(pos[0]),
      y: Number(pos[1]),
      z: Number(pos[2]),
      name: blockName,
      properties
    });
  }

  return blocks;
}

function normalizeBlocks(blocks) {
  if (blocks.length === 0) return blocks;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;

  for (const block of blocks) {
    if (block.x < minX) minX = block.x;
    if (block.y < minY) minY = block.y;
    if (block.z < minZ) minZ = block.z;
  }

  return blocks.map(block => ({
    ...block,
    x: block.x - minX,
    y: block.y - minY,
    z: block.z - minZ
  }));
}

function computeBounds(blocks, scale = 1, rotation = null) {
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
    update(projectPoint({ x: block.x, y: block.y, z: block.z }, 0, 0, scale, rotation));
    update(projectPoint({ x: block.x + 1, y: block.y, z: block.z }, 0, 0, scale, rotation));
    update(projectPoint({ x: block.x, y: block.y + 1, z: block.z }, 0, 0, scale, rotation));
    update(projectPoint({ x: block.x + 1, y: block.y + 1, z: block.z }, 0, 0, scale, rotation));
    update(projectPoint({ x: block.x, y: block.y, z: block.z + 1 }, 0, 0, scale, rotation));
    update(projectPoint({ x: block.x + 1, y: block.y, z: block.z + 1 }, 0, 0, scale, rotation));
    update(projectPoint({ x: block.x, y: block.y + 1, z: block.z + 1 }, 0, 0, scale, rotation));
    update(projectPoint({ x: block.x + 1, y: block.y + 1, z: block.z + 1 }, 0, 0, scale, rotation));
  }

  if (!Number.isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };

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

function getRotationCenter(blocks) {
  if (blocks.length === 0) return { x: 0, z: 0 };

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const block of blocks) {
    if (block.x < minX) minX = block.x;
    if (block.x + 1 > maxX) maxX = block.x + 1;
    if (block.z < minZ) minZ = block.z;
    if (block.z + 1 > maxZ) maxZ = block.z + 1;
  }

  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2
  };
}

function getScaledBounds(blocks, rotation) {
  const baseBounds = computeBounds(blocks, 1, rotation);
  const baseWidth = baseBounds.maxX - baseBounds.minX + padding * 2;
  const baseHeight = baseBounds.maxY - baseBounds.minY + padding * 2;
  const scale = Math.min(1, maxImageSize / Math.max(baseWidth, baseHeight));

  return {
    scale,
    bounds: computeBounds(blocks, scale, rotation)
  };
}

function renderBlocksToPngFrame(blocks, options = {}) {
  const rotation = options.rotation ?? null;
  const scale = options.scale ?? 1;
  const bounds = options.bounds ?? computeBounds(blocks, scale, rotation);
  const width = Math.max(1, Math.ceil(bounds.maxX - bounds.minX + padding * 2));
  const height = Math.max(1, Math.ceil(bounds.maxY - bounds.minY + padding * 2));

  const png = new PNG({ width, height });
  fillBackground(png);

  if (blocks.length === 0) return png;

  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;
  const quads = [];

  for (const block of blocks) {
    quads.push(...makeBlockQuads(block, offsetX, offsetY, scale, rotation));
  }

  quads.sort((a, b) => a.depth - b.depth);

  for (const quad of quads) {
    drawTexturedQuad(png, quad);
  }

  return png;
}

function encodePng(png) {
  return PNG.sync.write(png, {
    colorType: 6,
    inputColorType: 6,
    deflateLevel: pngCompressionLevel,
    filterType: 4
  });
}

function renderBlocksToPngViews(blocks) {
  blocks = normalizeBlocks(blocks);

  if (blocks.length === 0) {
    const blank = renderBlocksToPngFrame([], { bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 }, scale: 1 });
    return previewRotations.map(view => ({ ...view, buffer: encodePng(blank) }));
  }

  const center = getRotationCenter(blocks);

  return previewRotations.map(view => {
    const rotation = { degrees: view.degrees, center };
    const { bounds, scale } = getScaledBounds(blocks, rotation);
    const png = renderBlocksToPngFrame(blocks, { bounds, scale, rotation });

    return {
      ...view,
      buffer: encodePng(png)
    };
  });
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function addResourceLocation(value, result) {
  if (typeof value !== "string") return;
  if (value === "minecraft:empty") return;
  if (!value.includes(":")) return;
  if (value.startsWith("#")) return;
  result.add(value);
}

function collectTemplatePoolsFromObject(value, result = new Set()) {
  if (value === null || value === undefined) return result;

  if (typeof value === "string") {
    addResourceLocation(value, result);
    return result;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTemplatePoolsFromObject(item, result);
    return result;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (
        key === "start_pool" ||
        key === "fallback" ||
        key === "pool" ||
        key === "template_pool" ||
        key === "target_pool"
      ) {
        collectTemplatePoolsFromObject(nested, result);
        continue;
      }

      collectTemplatePoolsFromObject(nested, result);
    }
  }

  return result;
}

function getTemplatePoolFile(poolId) {
  const [namespace, poolPath] = splitResourceLocation(poolId);
  return path.join(inputRoot, namespace, "worldgen", "template_pool", `${poolPath}.json`);
}

function getStructureNbtFileFromLocation(location) {
  const [namespace, structurePath] = splitResourceLocation(location);
  return path.join(inputRoot, namespace, "structure", `${structurePath}.nbt`);
}

function collectElementLocations(element, result = new Set()) {
  if (!element || typeof element !== "object") return result;

  if (typeof element.location === "string") result.add(element.location);

  if (Array.isArray(element.elements)) {
    for (const nested of element.elements) {
      collectElementLocations(nested.element ?? nested, result);
    }
  }

  if (element.element) collectElementLocations(element.element, result);

  return result;
}

function collectJigsawPoolsFromNbt(value, result = new Set()) {
  if (value === null || value === undefined) return result;

  if (Array.isArray(value)) {
    for (const item of value) collectJigsawPoolsFromNbt(item, result);
    return result;
  }

  if (typeof value !== "object") return result;

  const blockId = value.id ?? value.Id ?? value.Name ?? value.name;
  const likelyJigsaw =
    blockId === "minecraft:jigsaw" ||
    value.pool !== undefined ||
    value.target_pool !== undefined ||
    value.final_state !== undefined;

  if (likelyJigsaw) {
    addResourceLocation(value.pool, result);
    addResourceLocation(value.target_pool, result);
  }

  for (const nested of Object.values(value)) collectJigsawPoolsFromNbt(nested, result);

  return result;
}

async function collectJigsawPoolsFromStructureFile(structureFile) {
  if (!fs.existsSync(structureFile)) return new Set();

  try {
    const structure = await readNbtFile(structureFile);
    return collectJigsawPoolsFromNbt(structure);
  } catch (error) {
    console.warn(`Could not inspect jigsaw pools in ${structureFile}: ${error.message}`);
    return new Set();
  }
}

async function collectStructureFilesFromTemplatePool(poolId, seenPools = new Set(), result = new Set()) {
  if (seenPools.has(poolId)) return result;
  seenPools.add(poolId);

  const poolFile = getTemplatePoolFile(poolId);
  const poolJson = readJsonIfExists(poolFile);
  if (!poolJson) return result;

  stats.poolsRead++;

  for (const element of poolJson.elements ?? []) {
    const elementData = element.element ?? element;
    const locations = collectElementLocations(elementData);

    for (const location of locations) {
      const structureFile = getStructureNbtFileFromLocation(location);
      if (!fs.existsSync(structureFile)) continue;

      const alreadyHadFile = result.has(structureFile);
      result.add(structureFile);

      if (!alreadyHadFile) {
        const jigsawPools = await collectJigsawPoolsFromStructureFile(structureFile);

        for (const nestedPool of jigsawPools) {
          stats.jigsawPoolsFollowed++;
          await collectStructureFilesFromTemplatePool(nestedPool, seenPools, result);
        }
      }
    }
  }

  if (poolJson.fallback && poolJson.fallback !== "minecraft:empty") {
    await collectStructureFilesFromTemplatePool(poolJson.fallback, seenPools, result);
  }

  return result;
}


function getFirstNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getStructureSize(structure) {
  const size = structure.size ?? structure.Size ?? [0, 0, 0];
  return {
    x: getFirstNumber(size[0]),
    y: getFirstNumber(size[1]),
    z: getFirstNumber(size[2])
  };
}

function unwrapNbtValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (Object.prototype.hasOwnProperty.call(value, "value")) return unwrapNbtValue(value.value);
    if (Object.prototype.hasOwnProperty.call(value, "Value")) return unwrapNbtValue(value.Value);
  }
  return value;
}

function getJigsawNbtValue(nbtData, key) {
  if (!nbtData || typeof nbtData !== "object") return undefined;

  const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const pascalKey = camelKey.charAt(0).toUpperCase() + camelKey.slice(1);
  const candidates = [key, camelKey, pascalKey, key.toUpperCase()];

  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(nbtData, candidate)) {
      return unwrapNbtValue(nbtData[candidate]);
    }
  }

  return undefined;
}

function normalizeResourceLocationForCompare(value) {
  value = unwrapNbtValue(value);
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") value = String(value);
  value = value.trim().replace(/^['"]|['"]$/g, "");
  if (!value || value === "minecraft:empty") return null;
  return value.includes(":") ? value : `minecraft:${value}`;
}

function getJigsawInfo(block, state) {
  const blockName = getBlockNameFromPaletteEntry(state);
  if (blockName !== "minecraft:jigsaw") return null;

  const nbtData = block.nbt;
  const pos = block.pos ?? block.position;
  if (!nbtData || !Array.isArray(pos) || pos.length < 3) return null;

  const properties = state?.Properties ?? state?.properties ?? {};
  const orientation = properties.orientation ?? properties.Orientation ?? "north_up";
  const [front = "north", top = "up"] = String(orientation).split("_");

  return {
    x: getFirstNumber(pos[0]),
    y: getFirstNumber(pos[1]),
    z: getFirstNumber(pos[2]),
    name: normalizeResourceLocationForCompare(getJigsawNbtValue(nbtData, "name")),
    target: normalizeResourceLocationForCompare(getJigsawNbtValue(nbtData, "target")),
    // target_pool is the pool to draw the next piece from. pool is connector
    // metadata and is only used when matching to a child connector.
    targetPool: normalizeResourceLocationForCompare(getJigsawNbtValue(nbtData, "target_pool")),
    pool: normalizeResourceLocationForCompare(getJigsawNbtValue(nbtData, "pool")),
    finalState: getJigsawNbtValue(nbtData, "final_state"),
    orientation,
    front,
    top
  };
}

function getJigsawsFromStructure(structure) {
  const palette = getPalette(structure);
  const jigsaws = [];

  for (const block of structure.blocks ?? []) {
    const state = palette[block.state];
    const info = getJigsawInfo(block, state);
    if (info) jigsaws.push(info);
  }

  return jigsaws;
}

function directionToVector(direction) {
  switch (direction) {
    case "north": return { x: 0, y: 0, z: -1 };
    case "south": return { x: 0, y: 0, z: 1 };
    case "west": return { x: -1, y: 0, z: 0 };
    case "east": return { x: 1, y: 0, z: 0 };
    case "down": return { x: 0, y: -1, z: 0 };
    case "up":
    default: return { x: 0, y: 1, z: 0 };
  }
}

function rotateYVector(vector, quarterTurns) {
  let x = vector.x;
  let z = vector.z;
  const turns = ((quarterTurns % 4) + 4) % 4;

  for (let i = 0; i < turns; i++) {
    const nextX = -z;
    const nextZ = x;
    x = nextX;
    z = nextZ;
  }

  return { x, y: vector.y, z };
}

function vectorKey(vector) {
  return `${vector.x},${vector.y},${vector.z}`;
}

function rotateYPosition(pos, size, quarterTurns) {
  const turns = ((quarterTurns % 4) + 4) % 4;
  let x = pos.x;
  let z = pos.z;
  let sx = size.x;
  let sz = size.z;

  for (let i = 0; i < turns; i++) {
    const nextX = sz - 1 - z;
    const nextZ = x;
    x = nextX;
    z = nextZ;
    const oldSx = sx;
    sx = sz;
    sz = oldSx;
  }

  return { x, y: pos.y, z };
}

function rotateYDirection(direction, quarterTurns) {
  const horizontal = ["north", "east", "south", "west"];
  const index = horizontal.indexOf(direction);
  if (index === -1) return direction;
  return horizontal[(index + quarterTurns + 400) % 4];
}

function rotateYProperties(properties, quarterTurns) {
  const rotated = { ...(properties ?? {}) };

  if (rotated.facing) rotated.facing = rotateYDirection(rotated.facing, quarterTurns);
  if (rotated.horizontal_facing) rotated.horizontal_facing = rotateYDirection(rotated.horizontal_facing, quarterTurns);
  if (rotated.orientation) {
    const [front, top = "up"] = String(rotated.orientation).split("_");
    rotated.orientation = `${rotateYDirection(front, quarterTurns)}_${rotateYDirection(top, quarterTurns)}`;
  }
  if (rotated.rotation !== undefined) {
    const value = Number(rotated.rotation);
    if (Number.isFinite(value)) rotated.rotation = String((value + quarterTurns * 4 + 1600) % 16);
  }

  if (rotated.axis === "x" || rotated.axis === "z") {
    if (quarterTurns % 2 !== 0) rotated.axis = rotated.axis === "x" ? "z" : "x";
  }

  if (rotated.shape) {
    const rotateShape = shape => {
      const map = {
        north_south: "east_west",
        east_west: "north_south",
        ascending_north: "ascending_east",
        ascending_east: "ascending_south",
        ascending_south: "ascending_west",
        ascending_west: "ascending_north",
        south_east: "south_west",
        south_west: "north_west",
        north_west: "north_east",
        north_east: "south_east"
      };
      return map[shape] ?? shape;
    };
    for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) rotated.shape = rotateShape(rotated.shape);
  }

  return rotated;
}

function transformStructureBlocks(structure, offset, quarterTurns = 0) {
  const size = getStructureSize(structure);

  return collectBlocksFromStructure(structure).map(block => {
    const rotated = rotateYPosition(block, size, quarterTurns);

    return {
      ...block,
      x: rotated.x + offset.x,
      y: rotated.y + offset.y,
      z: rotated.z + offset.z,
      properties: rotateYProperties(block.properties, quarterTurns)
    };
  });
}

function transformJigsaw(jigsaw, size, offset, quarterTurns = 0) {
  const rotated = rotateYPosition(jigsaw, size, quarterTurns);
  const frontVector = rotateYVector(directionToVector(jigsaw.front), quarterTurns);

  return {
    ...jigsaw,
    x: rotated.x + offset.x,
    y: rotated.y + offset.y,
    z: rotated.z + offset.z,
    frontVector
  };
}

function getTemplatePoolChoices(poolJson) {
  const choices = [];

  // Minecraft chooses one top-level template_pool element by weight. Some
  // elements contain nested data, but the weight belongs to the top-level
  // pool entry, so do not flatten locations before rolling or large nested
  // entries would be overrepresented.
  for (const element of poolJson?.elements ?? []) {
    const elementData = element.element ?? element;
    const weight = Math.max(0, Number(element.weight ?? elementData.weight ?? 1));
    const locations = Array.from(collectElementLocations(elementData))
      .filter(location => fs.existsSync(getStructureNbtFileFromLocation(location)));

    choices.push({
      locations,
      location: locations[0] ?? null,
      weight,
      element: elementData
    });
  }

  return choices;
}

function chooseTemplatePoolLocations(poolJson) {
  return getTemplatePoolChoices(poolJson)
    .flatMap(choice => choice.locations ?? (choice.location ? [choice.location] : []));
}

function hasTemplatePool(poolId) {
  return !!poolId && poolId !== "minecraft:empty" && fs.existsSync(getTemplatePoolFile(poolId));
}

function getJigsawExpansionPool(jigsaw) {
  // Dynamic schema support:
  // - New/custom exports may expose the outgoing template pool as `target_pool`.
  // - Vanilla structure-template NBT commonly stores that same outgoing pool in
  //   `pool`.  Only treat `pool` as an expansion source when it resolves to an
  //   actual template_pool JSON in the current repo, so connector-only values do
  //   not accidentally expand.
  if (hasTemplatePool(jigsaw.targetPool)) return jigsaw.targetPool;
  if (hasTemplatePool(jigsaw.pool)) return jigsaw.pool;
  return null;
}

function getJigsawConnectorPool(jigsaw, expansionPool = null) {
  // In some data sets `pool` is connector metadata; in vanilla-style NBT it is
  // the expansion pool.  Do not use it as connector metadata when it is the same
  // value we are expanding from.
  if (!jigsaw?.pool) return null;
  if (expansionPool && jigsaw.pool === expansionPool) return null;
  return jigsaw.pool;
}

function weightedPoolChoiceOrder(choices, seedText) {
  const remaining = choices.filter(choice => (choice.weight ?? 0) > 0);
  const ordered = [];
  let salt = 0;

  // Weighted without replacement: first choice is a correct weighted roll. If
  // that element cannot physically connect/fit, try the remaining elements in
  // weighted-random order instead of falling back to index 0 or rendering all.
  while (remaining.length > 0) {
    const choice = chooseWeightedEntry(remaining, `${seedText}|candidate|${salt++}`) ?? remaining[0];
    ordered.push(choice);
    const index = remaining.indexOf(choice);
    if (index >= 0) remaining.splice(index, 1);
    else break;
  }

  return ordered;
}

async function chooseStructuresFromTemplatePool(poolId, seenPools = new Set(), seedText = previewSeed) {
  if (!poolId || poolId === "minecraft:empty" || seenPools.has(poolId)) return [];
  seenPools.add(poolId);

  const poolJson = readJsonIfExists(getTemplatePoolFile(poolId));
  if (!poolJson) return [];
  stats.poolsRead++;

  const choices = getTemplatePoolChoices(poolJson);
  const ordered = weightedPoolChoiceOrder(choices, `${seedText}|pool|${poolId}`);
  const candidates = [];

  for (const choice of ordered) {
    // Preserve empty/non-structure entries as a valid no-child result when they
    // win the weighted roll. Later entries are only tried if a chosen structure
    // exists but cannot connect/fit.
    if (!choice?.location) {
      candidates.push({ empty: true, weight: choice?.weight ?? 0 });
      continue;
    }

    candidates.push({
      location: choice.location,
      structureFile: getStructureNbtFileFromLocation(choice.location),
      weight: choice.weight
    });
  }

  if (candidates.length > 0) return candidates;

  if (poolJson.fallback && poolJson.fallback !== "minecraft:empty") {
    return chooseStructuresFromTemplatePool(poolJson.fallback, seenPools, `${seedText}|fallback`);
  }

  return [];
}

function connectorCompatibilityScore(parent, child, expansionPool) {
  let score = 0;

  // Primary jigsaw connector rule: the parent asks for `target`, and the child
  // connector offers `name`. This is the rule that should drive attachment.
  if (parent.target && child.name && child.name === parent.target) score += 1000;

  // Mirrored metadata is common in generated structures and is safe as a
  // secondary signal, but it must never replace parent.target -> child.name.
  if (parent.name && child.target && child.target === parent.name) score += 100;

  // Some custom/exported jigsaws use `pool` as connector metadata. Use it only
  // as a weak tie-breaker/fallback, never as the expansion source and never as a
  // hard requirement.
  const parentConnectorPool = getJigsawConnectorPool(parent, expansionPool);
  const childConnectorPool = getJigsawConnectorPool(child, null);
  if (parentConnectorPool && childConnectorPool && childConnectorPool === parentConnectorPool) score += 25;

  // Named connectors should not attach to unrelated named connectors. Pool-only
  // matches are allowed only when no names are available.
  if ((parent.target || child.name) && score === 0) return -1;

  return score;
}

function findCompatibleChildConnectors(parent, childJigsaws, expansionPool, parentFrontVector = null) {
  const scored = [];

  for (const child of childJigsaws) {
    const score = connectorCompatibilityScore(parent, child, expansionPool);
    if (score < 0) continue;

    const orientationScore = parentFrontVector
      ? (getQuarterTurnsToFace(directionToVector(child.front), parentFrontVector) >= 0 ? 5 : 0)
      : 0;

    scored.push({ child, score: score + orientationScore });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(entry => entry.child);
}

function findCompatibleChildConnector(parent, childJigsaws, expansionPool, parentFrontVector = null) {
  return findCompatibleChildConnectors(parent, childJigsaws, expansionPool, parentFrontVector)[0] ?? null;
}

async function chooseStructureFromTemplatePool(poolId, seenPools = new Set(), seedText = previewSeed) {
  if (!poolId || poolId === "minecraft:empty" || seenPools.has(poolId)) return null;
  seenPools.add(poolId);

  const poolJson = readJsonIfExists(getTemplatePoolFile(poolId));
  if (!poolJson) return null;
  stats.poolsRead++;

  const choices = getTemplatePoolChoices(poolJson);

  if (choices.length > 0) {
    const choice = chooseWeightedEntry(choices, `${seedText}|pool|${poolId}`) ?? choices[0];

    // The chosen pool element may be minecraft:empty or another non-structure
    // element. That means this jigsaw does not place a child here; do not
    // silently try the next pool entry, because that would no longer be a
    // weight-correct random choice.
    if (!choice?.location) return null;

    return {
      location: choice.location,
      structureFile: getStructureNbtFileFromLocation(choice.location),
      weight: choice.weight
    };
  }

  if (poolJson.fallback && poolJson.fallback !== "minecraft:empty") {
    return chooseStructureFromTemplatePool(poolJson.fallback, seenPools, `${seedText}|fallback`);
  }

  return null;
}

function getQuarterTurnsToFace(childFront, parentFront) {
  const desired = { x: -parentFront.x, y: -parentFront.y, z: -parentFront.z };

  for (let turns = 0; turns < 4; turns++) {
    if (vectorKey(rotateYVector(childFront, turns)) === vectorKey(desired)) return turns;
  }

  return 0;
}

function makeBlockKey(block) {
  return `${block.x},${block.y},${block.z}`;
}

async function assembleJigsawStructureFromPool(startPool, options = {}) {
  const maxDepth = options.maxDepth ?? 7;
  const maxDistanceFromCenter = options.maxDistanceFromCenter ?? null;
  const start = await chooseStructureFromTemplatePool(startPool, new Set(), `${startPool}|start`);
  if (!start) return { blocks: [], files: [], resolvedJigsaws: 0 };

  const blocks = [];
  const occupied = new Set();
  const queue = [{
    structureFile: start.structureFile,
    offset: { x: 0, y: 0, z: 0 },
    quarterTurns: 0,
    depth: 0,
    consumedConnector: null
  }];
  const placed = new Set();
  const placedFiles = new Set();
  let resolvedJigsaws = 0;
  let startBounds = null;

  while (queue.length > 0) {
    const item = queue.shift();
    const placedKey = `${item.structureFile}|${item.offset.x},${item.offset.y},${item.offset.z}|${item.quarterTurns}`;
    if (placed.has(placedKey)) continue;
    placed.add(placedKey);
    placedFiles.add(item.structureFile);

    const structure = await readNbtFile(item.structureFile);
    const size = getStructureSize(structure);
    const transformedBlocks = transformStructureBlocks(structure, item.offset, item.quarterTurns);
    if (item.depth === 0 && !startBounds) startBounds = getBlockBounds(transformedBlocks);

    for (const block of transformedBlocks) {
      const key = makeBlockKey(block);
      if (occupied.has(key)) continue;
      occupied.add(key);
      blocks.push(block);
    }

    if (item.depth >= maxDepth) continue;

    for (const parent of getJigsawsFromStructure(structure)) {
      // A jigsaw used as the incoming connector for this piece is already consumed.
      // Expanding it again makes the preview grow backwards and quickly creates the
      // "all pieces blob" that does not match jigsaw placement behavior.
      if (
        item.consumedConnector &&
        parent.x === item.consumedConnector.x &&
        parent.y === item.consumedConnector.y &&
        parent.z === item.consumedConnector.z
      ) {
        continue;
      }

      // Only actual jigsaw blocks inside the currently placed structure can extend
      // the assembly. Do not scan arbitrary worldgen JSON or all template-pool files.
      const expansionPool = getJigsawExpansionPool(parent);
      if (!expansionPool) continue;

      const worldParent = transformJigsaw(parent, size, item.offset, item.quarterTurns);
      const seedText = `${item.structureFile}|${item.offset.x},${item.offset.y},${item.offset.z}|${item.quarterTurns}|${parent.x},${parent.y},${parent.z}|${parent.name}|${parent.target}|${parent.targetPool}|${parent.pool}`;
      const childChoices = await chooseStructuresFromTemplatePool(expansionPool, new Set(), seedText);
      if (childChoices.length === 0) continue;

      let placedChild = false;
      for (const childChoice of childChoices) {
        if (childChoice.empty) break;

        if (!fs.existsSync(childChoice.structureFile)) continue;

        const childStructure = await readNbtFile(childChoice.structureFile);
        const childSize = getStructureSize(childStructure);
        const childJigsaws = getJigsawsFromStructure(childStructure);
        const parentFront = worldParent.frontVector ?? directionToVector(worldParent.front);
        const childConnectors = findCompatibleChildConnectors(parent, childJigsaws, expansionPool, parentFront);
        if (childConnectors.length === 0) continue;

        for (const childConnector of childConnectors) {
          const childFront = directionToVector(childConnector.front);
          const childTurns = getQuarterTurnsToFace(childFront, parentFront);
          const rotatedChildConnector = rotateYPosition(childConnector, childSize, childTurns);
          const attach = {
            x: worldParent.x + parentFront.x,
            y: worldParent.y + parentFront.y,
            z: worldParent.z + parentFront.z
          };
          const childOffset = {
            x: attach.x - rotatedChildConnector.x,
            y: attach.y - rotatedChildConnector.y,
            z: attach.z - rotatedChildConnector.z
          };

          const childBlocks = transformStructureBlocks(childStructure, childOffset, childTurns);
          if (!isWithinMaxDistanceFromStart(childBlocks, startBounds, maxDistanceFromCenter)) continue;

          const overlapsExistingBlock = childBlocks.some(block => occupied.has(makeBlockKey(block)));
          if (overlapsExistingBlock) continue;

          resolvedJigsaws++;
          stats.jigsawPoolsFollowed++;
          stats.jigsawBlocksResolved++;

          queue.push({
            structureFile: childChoice.structureFile,
            offset: childOffset,
            quarterTurns: childTurns,
            depth: item.depth + 1,
            consumedConnector: {
              x: childConnector.x,
              y: childConnector.y,
              z: childConnector.z
            }
          });
          placedChild = true;
          break;
        }

        if (placedChild) break;
      }

      if (!placedChild) continue;
    }
  }

  return { blocks, files: [...placedFiles].sort(), resolvedJigsaws };
}

function findFirstValueForKey(value, wantedKey) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstValueForKey(item, wantedKey);
      if (found !== null && found !== undefined) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  if (value[wantedKey] !== undefined) return value[wantedKey];
  for (const nested of Object.values(value)) {
    const found = findFirstValueForKey(nested, wantedKey);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}


function clampNumber(value, min, max, fallback = null) {
  const number = Number(unwrapNbtValue(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function getNestedFirstValue(value, ...keys) {
  for (const key of keys) {
    const found = findFirstValueForKey(value, key);
    if (found !== null && found !== undefined) return unwrapNbtValue(found);
  }
  return undefined;
}

function parseMaxDistanceFromCenter(value, terrainAdaptation = "none") {
  value = unwrapNbtValue(value);
  if (value === null || value === undefined) return null;

  const maxHorizontal = terrainAdaptation === "none" ? 128 : 116;

  if (typeof value === "number" || typeof value === "string") {
    const horizontal = clampNumber(value, 1, maxHorizontal, null);
    if (horizontal === null) return null;
    return { horizontal, vertical: horizontal };
  }

  if (typeof value === "object") {
    const horizontalValue = value.horizontal ?? value.Horizontal ?? getNestedFirstValue(value, "horizontal", "Horizontal");
    const verticalValue = value.vertical ?? value.Vertical ?? getNestedFirstValue(value, "vertical", "Vertical");
    const horizontal = clampNumber(horizontalValue, 1, maxHorizontal, null);
    if (horizontal === null) return null;
    const vertical = clampNumber(verticalValue ?? 4064, 1, 4064, 4064);
    return { horizontal, vertical };
  }

  return null;
}

function parseJigsawGenerationConstraints(json) {
  const sizeValue = json.size ?? json.Size ?? getNestedFirstValue(json, "size", "Size");
  const size = sizeValue === undefined ? null : clampNumber(sizeValue, 0, 20, null);
  const maxDistanceValue = json.max_distance_from_center
    ?? json.maxDistanceFromCenter
    ?? getNestedFirstValue(json, "max_distance_from_center", "maxDistanceFromCenter");
  const terrainAdaptation = String(json.terrain_adaptation ?? json.terrainAdaptation ?? "none");
  const maxDistanceFromCenter = parseMaxDistanceFromCenter(maxDistanceValue, terrainAdaptation);

  return {
    // Preserve the existing preview safety depth when the structure JSON omits
    // size. When size exists, follow Minecraft's 0..20 generation-depth limit.
    maxDepth: size === null ? 7 : size,
    maxDistanceFromCenter
  };
}

function getBlockBounds(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity
  };

  for (const block of blocks) {
    bounds.minX = Math.min(bounds.minX, block.x);
    bounds.minY = Math.min(bounds.minY, block.y);
    bounds.minZ = Math.min(bounds.minZ, block.z);
    bounds.maxX = Math.max(bounds.maxX, block.x);
    bounds.maxY = Math.max(bounds.maxY, block.y);
    bounds.maxZ = Math.max(bounds.maxZ, block.z);
  }

  return bounds;
}

function intervalGap(aMin, aMax, bMin, bMax) {
  if (aMax < bMin) return bMin - aMax;
  if (bMax < aMin) return aMin - bMax;
  return 0;
}

function isWithinMaxDistanceFromStart(candidateBlocks, startBounds, maxDistanceFromCenter) {
  if (!maxDistanceFromCenter || !startBounds) return true;
  const candidateBounds = getBlockBounds(candidateBlocks);
  if (!candidateBounds) return true;

  const dx = intervalGap(candidateBounds.minX, candidateBounds.maxX, startBounds.minX, startBounds.maxX);
  const dz = intervalGap(candidateBounds.minZ, candidateBounds.maxZ, startBounds.minZ, startBounds.maxZ);
  const dy = intervalGap(candidateBounds.minY, candidateBounds.maxY, startBounds.minY, startBounds.maxY);
  const horizontal = Math.max(dx, dz);

  return horizontal <= maxDistanceFromCenter.horizontal && dy <= maxDistanceFromCenter.vertical;
}

async function collectStructureFilesForWorldgenStructure(worldgenFile) {
  const info = getWorldgenStructureInfo(worldgenFile);
  const json = readJsonIfExists(worldgenFile);
  if (!info || !json) return null;

  const startPool = normalizeResourceLocationForCompare(
    json.start_pool ?? json.startPool ?? findFirstValueForKey(json, "start_pool") ?? findFirstValueForKey(json, "startPool")
  );

  if (!startPool) {
    console.warn(`No start_pool found for worldgen structure ${worldgenFile}`);
    return null;
  }

  const constraints = parseJigsawGenerationConstraints(json);
  const assembled = await assembleJigsawStructureFromPool(startPool, constraints);

  return {
    namespace: info.namespace,
    relativePath: info.relativePath,
    id: info.id,
    files: assembled.files,
    blocks: assembled.blocks,
    resolvedJigsaws: assembled.resolvedJigsaws,
    worldgen: true
  };
}

function getDirectStructureGroups() {
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
        outputName: info.topFolder,
        files: []
      });
    }

    groups.get(key).files.push(file);
  }

  return groups;
}

async function getWorldgenStructureGroups() {
  const groups = new Map();

  if (!generateWorldgenStructurePreviews) return groups;

  const worldgenFiles = walk(inputRoot)
    .filter(file => file.endsWith(".json"))
    .filter(file => getWorldgenStructureInfo(file) !== null);

  for (const file of worldgenFiles) {
    const group = await collectStructureFilesForWorldgenStructure(file);

    if (!group || !Array.isArray(group.blocks) || group.blocks.length === 0) {
      console.warn(`Could not assemble jigsaw preview for worldgen structure ${file}`);
      continue;
    }

    groups.set(group.id, {
      namespace: group.namespace,
      outputName: group.relativePath,
      files: group.files,
      blocks: group.blocks,
      resolvedJigsaws: group.resolvedJigsaws,
      worldgen: true
    });
  }

  return groups;
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

  for (const file of walk(outputRoot).filter(file => file.endsWith(".png") || file.endsWith(".gif"))) {
    const normalized = path.normalize(file);

    if (!validOutputFiles.has(normalized)) {
      fs.rmSync(file);
      console.log(`Removed stale ${file}`);
    }
  }
}

async function main() {
  console.log(`Using STRUCTURE_PREVIEW_SEED=${previewSeed}`);
  const groups = await getWorldgenStructureGroups();

  if (groups.size === 0) {
    for (const [key, value] of getDirectStructureGroups()) {
      groups.set(key, value);
    }
  }

  console.log(`Found ${groups.size} rendered structure group(s).`);
  console.log(`Read ${stats.poolsRead} template pool(s), followed ${stats.jigsawPoolsFollowed} jigsaw pool reference(s).`);

  const validOutputFiles = new Set();

  for (const group of groups.values()) {
    group.files.sort();

    const blocks = group.worldgen
      ? group.blocks
      : (Array.isArray(group.blocks) && group.blocks.length > 0
        ? group.blocks
        : await loadBlocksForFiles(group.files));
    const outputDir = path.join(outputRoot, group.namespace, group.outputName);
    const views = renderBlocksToPngViews(blocks);

    fs.mkdirSync(outputDir, { recursive: true });

    let totalSize = 0;
    for (const view of views) {
      const outputPath = path.join(outputDir, `${view.name}.png`);
      validOutputFiles.add(path.normalize(outputPath));
      fs.writeFileSync(outputPath, view.buffer);
      totalSize += fs.statSync(outputPath).size;
      stats.mainImages++;
    }

    const sourceDescription = group.worldgen
      ? `${group.resolvedJigsaws ?? 0} resolved jigsaw block(s)`
      : `${group.files.length} structure part(s)`;
    console.log(`Generated ${views.length} PNG preview(s) in ${outputDir} from ${sourceDescription}, ${blocks.length} block(s), ${totalSize} total bytes`);
  }

  if (groups.size === 0) console.warn("No structure groups were found.");

  console.log(`Generated ${stats.mainImages} static preview PNG(s).`);
  console.log(`Baked ${stats.bakedQuads} model quad(s), skipped ${stats.skippedMissingModels} block model(s) with no renderable elements.`);
  console.log(`Texture files loaded: ${stats.textureHits}; missing/fallback lookups: ${stats.textureMisses}.`);

  removeStaleOutputFiles(validOutputFiles);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
