// scripts/generate-structure-previews.js
const fs = require("fs");
const path = require("path");
const nbt = require("prismarine-nbt");
const { PNG } = require("pngjs");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

const inputRoot = process.env.STRUCTURE_INPUT_ROOT ?? "data";
const outputRoot = process.env.STRUCTURE_PREVIEW_OUTPUT_ROOT ?? path.join("wiki", "images", "structures");
const vanillaAssetRoot = process.env.VANILLA_ASSET_ROOT ?? path.join(".cache", "vanilla-assets");
const generateWorldgenStructurePreviews = String(process.env.STRUCTURE_PREVIEW_WORLDGEN ?? "true") !== "false";

const tileWidth = Number(process.env.STRUCTURE_PREVIEW_TILE_WIDTH ?? 32);
const tileHeight = Number(process.env.STRUCTURE_PREVIEW_TILE_HEIGHT ?? 18);
const blockHeight = Number(process.env.STRUCTURE_PREVIEW_BLOCK_HEIGHT ?? 22);
const padding = Number(process.env.STRUCTURE_PREVIEW_PADDING ?? 48);
const maxImageSize = Number(process.env.STRUCTURE_PREVIEW_MAX_SIZE ?? 2800);
const transparentBackground = String(process.env.STRUCTURE_PREVIEW_TRANSPARENT ?? "true") !== "false";
const gifFrames = Math.max(1, Number(process.env.STRUCTURE_PREVIEW_GIF_FRAMES ?? 60));
const gifDelay = Math.max(1, Number(process.env.STRUCTURE_PREVIEW_GIF_DELAY ?? 160));

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

const stats = {
  mainImages: 0,
  structuresRead: 0,
  poolsRead: 0,
  jigsawPoolsFollowed: 0,
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

function normalizeVariant(variant) {
  if (Array.isArray(variant)) return variant[0] ?? null;
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

    variant = normalizeVariant(variant);

    if (variant?.model) {
      return [
        {
          model: variant.model,
          x: Number(variant.x ?? 0),
          y: Number(variant.y ?? 0),
          uvlock: Boolean(variant.uvlock)
        }
      ];
    }
  }

  if (Array.isArray(blockState.multipart)) {
    const variants = [];

    for (const part of blockState.multipart) {
      if (!whenClauseMatches(part.when, properties)) continue;

      const applies = Array.isArray(part.apply) ? part.apply : [part.apply];

      for (const apply of applies) {
        if (apply?.model) {
          variants.push({
            model: apply.model,
            x: Number(apply.x ?? 0),
            y: Number(apply.y ?? 0),
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
      const sampled = sampleTexture(texture, uv.u, uv.v);

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
        y: variant.y ?? 0
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

function bakeBlockModel(blockName, properties = {}) {
  const cacheKey = `${blockName}|${stringifyProperties(properties)}`;

  if (bakedModelCache.has(cacheKey)) return bakedModelCache.get(cacheKey);

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

  stats.bakedQuads += baked.length;
  bakedModelCache.set(cacheKey, baked);
  return baked;
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

  const minX = Math.min(...blocks.map(block => block.x));
  const maxX = Math.max(...blocks.map(block => block.x + 1));
  const minZ = Math.min(...blocks.map(block => block.z));
  const maxZ = Math.max(...blocks.map(block => block.z + 1));

  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2
  };
}

function getRotationDegrees(frame) {
  if (gifFrames <= 1) return 0;

  return (frame / gifFrames) * 360;
}

function getAnimatedBounds(blocks, scale = 1, center = getRotationCenter(blocks)) {
  let bounds = null;

  for (let frame = 0; frame < gifFrames; frame++) {
    const frameBounds = computeBounds(blocks, scale, {
      degrees: getRotationDegrees(frame),
      center
    });

    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, frameBounds.minX),
          maxX: Math.max(bounds.maxX, frameBounds.maxX),
          minY: Math.min(bounds.minY, frameBounds.minY),
          maxY: Math.max(bounds.maxY, frameBounds.maxY)
        }
      : frameBounds;
  }

  return bounds ?? { minX: 0, maxX: 1, minY: 0, maxY: 1 };
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

function encodeGifFrame(gif, png) {
  const rgba = new Uint8Array(png.data);
  const opaqueRgba = [];

  for (let i = 0; i < rgba.length; i += 4) {
    if (transparentBackground && rgba[i + 3] === 0) continue;
    opaqueRgba.push(rgba[i], rgba[i + 1], rgba[i + 2], 255);
  }

  const opaquePalette = opaqueRgba.length > 0 ? quantize(new Uint8Array(opaqueRgba), 255) : [];
  const palette = [[0, 0, 0], ...opaquePalette];
  const index = new Uint8Array(png.width * png.height);

  if (opaquePalette.length > 0) {
    const opaqueIndexes = applyPalette(new Uint8Array(opaqueRgba), opaquePalette);
    let opaqueCursor = 0;

    for (let source = 0, target = 0; source < rgba.length; source += 4, target++) {
      if (transparentBackground && rgba[source + 3] === 0) {
        index[target] = 0;
      } else {
        index[target] = opaqueIndexes[opaqueCursor++] + 1;
      }
    }
  }

  gif.writeFrame(index, png.width, png.height, {
    palette,
    delay: gifDelay,
    transparent: transparentBackground,
    transparentIndex: 0
  });
}

function renderBlocksToGif(blocks) {
  blocks = normalizeBlocks(blocks);

  if (blocks.length === 0) {
    const gif = GIFEncoder();
    encodeGifFrame(gif, renderBlocksToPngFrame([], { bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 }, scale: 1 }));
    gif.finish();
    return Buffer.from(gif.bytesView());
  }

  const center = getRotationCenter(blocks);
  const baseBounds = getAnimatedBounds(blocks, 1, center);
  const baseWidth = baseBounds.maxX - baseBounds.minX + padding * 2;
  const baseHeight = baseBounds.maxY - baseBounds.minY + padding * 2;
  const scale = Math.min(1, maxImageSize / Math.max(baseWidth, baseHeight));
  const bounds = getAnimatedBounds(blocks, scale, center);
  const gif = GIFEncoder();

  for (let frame = 0; frame < gifFrames; frame++) {
    const rotation = {
      degrees: getRotationDegrees(frame),
      center
    };

    encodeGifFrame(gif, renderBlocksToPngFrame(blocks, { bounds, scale, rotation }));
  }

  gif.finish();
  return Buffer.from(gif.bytesView());
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

function getJigsawNbtValue(nbtData, key) {
  if (!nbtData || typeof nbtData !== "object") return undefined;
  return nbtData[key] ?? nbtData[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] ?? nbtData[key.toUpperCase()];
}

function normalizeResourceLocationForCompare(value) {
  if (typeof value !== "string") return null;
  if (!value) return null;
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

function chooseTemplatePoolLocations(poolJson) {
  const locations = [];

  for (const element of poolJson?.elements ?? []) {
    const elementData = element.element ?? element;
    const elementLocations = [...collectElementLocations(elementData)];
    if (elementLocations.length > 0) locations.push(...elementLocations);
  }

  return locations;
}

async function chooseStructureFromTemplatePool(poolId, seenPools = new Set()) {
  if (!poolId || poolId === "minecraft:empty" || seenPools.has(poolId)) return null;
  seenPools.add(poolId);

  const poolJson = readJsonIfExists(getTemplatePoolFile(poolId));
  if (!poolJson) return null;
  stats.poolsRead++;

  for (const location of chooseTemplatePoolLocations(poolJson)) {
    const structureFile = getStructureNbtFileFromLocation(location);
    if (fs.existsSync(structureFile)) return { location, structureFile };
  }

  if (poolJson.fallback && poolJson.fallback !== "minecraft:empty") {
    return chooseStructureFromTemplatePool(poolJson.fallback, seenPools);
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

async function assembleJigsawStructureFromPool(startPool, maxDepth = 7) {
  const start = await chooseStructureFromTemplatePool(startPool);
  if (!start) return [];

  const blocks = [];
  const occupied = new Set();
  const queue = [{ structureFile: start.structureFile, offset: { x: 0, y: 0, z: 0 }, quarterTurns: 0, depth: 0 }];
  const placed = new Set();

  while (queue.length > 0) {
    const item = queue.shift();
    const placedKey = `${item.structureFile}|${item.offset.x},${item.offset.y},${item.offset.z}|${item.quarterTurns}`;
    if (placed.has(placedKey)) continue;
    placed.add(placedKey);

    const structure = await readNbtFile(item.structureFile);
    const size = getStructureSize(structure);

    for (const block of transformStructureBlocks(structure, item.offset, item.quarterTurns)) {
      const key = makeBlockKey(block);
      if (occupied.has(key)) continue;
      occupied.add(key);
      blocks.push(block);
    }

    if (item.depth >= maxDepth) continue;

    for (const parent of getJigsawsFromStructure(structure)) {
      if (!parent.pool || parent.pool === "minecraft:empty") continue;

      const worldParent = transformJigsaw(parent, size, item.offset, item.quarterTurns);
      const childChoice = await chooseStructureFromTemplatePool(parent.pool);
      if (!childChoice) continue;

      stats.jigsawPoolsFollowed++;
      const childStructure = await readNbtFile(childChoice.structureFile);
      const childSize = getStructureSize(childStructure);
      const childJigsaws = getJigsawsFromStructure(childStructure);
      const childConnector = childJigsaws.find(jigsaw => jigsaw.name === parent.target) ?? childJigsaws[0];
      if (!childConnector) continue;

      const parentFront = worldParent.frontVector ?? directionToVector(worldParent.front);
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

      queue.push({
        structureFile: childChoice.structureFile,
        offset: childOffset,
        quarterTurns: childTurns,
        depth: item.depth + 1
      });
    }
  }

  return blocks;
}

async function collectStructureFilesForWorldgenStructure(worldgenFile) {
  const info = getWorldgenStructureInfo(worldgenFile);
  const json = readJsonIfExists(worldgenFile);
  if (!info || !json) return null;

  const pools = collectTemplatePoolsFromObject(json);
  const files = new Set();
  let blocks = [];

  const startPool = normalizeResourceLocationForCompare(json.start_pool ?? json.startPool);
  const maxDepth = Math.max(1, Number(json.size ?? json.max_distance_from_center ?? 7));

  if (startPool) {
    blocks = await assembleJigsawStructureFromPool(startPool, maxDepth);
  }

  for (const poolId of pools) {
    await collectStructureFilesFromTemplatePool(poolId, new Set(), files);
  }

  return {
    namespace: info.namespace,
    relativePath: info.relativePath,
    id: info.id,
    files: [...files].sort(),
    blocks
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

    if (!group || group.files.length === 0) {
      console.warn(`No template NBT files found for worldgen structure ${file}`);
      continue;
    }

    groups.set(group.id, {
      namespace: group.namespace,
      outputName: group.relativePath,
      files: group.files,
      blocks: group.blocks
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

  for (const file of walk(outputRoot).filter(file => file.endsWith(".gif"))) {
    const normalized = path.normalize(file);

    if (!validOutputFiles.has(normalized)) {
      fs.rmSync(file);
      console.log(`Removed stale ${file}`);
    }
  }
}

async function main() {
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

    const blocks = Array.isArray(group.blocks) && group.blocks.length > 0
      ? group.blocks
      : await loadBlocksForFiles(group.files);
    const outputPath = path.join(outputRoot, group.namespace, `${group.outputName}.gif`);

    validOutputFiles.add(path.normalize(outputPath));

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, renderBlocksToGif(blocks));
    stats.mainImages++;

    const mainSize = fs.statSync(outputPath).size;
    console.log(`Generated ${outputPath} from ${group.files.length} structure part(s), ${blocks.length} block(s), ${mainSize} bytes`);
  }

  if (groups.size === 0) console.warn("No structure groups were found.");

  console.log(`Generated ${stats.mainImages} animated preview GIF(s).`);
  console.log(`Baked ${stats.bakedQuads} model quad(s), skipped ${stats.skippedMissingModels} block model(s) with no renderable elements.`);
  console.log(`Texture files loaded: ${stats.textureHits}; missing/fallback lookups: ${stats.textureMisses}.`);

  removeStaleOutputFiles(validOutputFiles);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
