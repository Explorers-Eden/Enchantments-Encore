// scripts/download-vanilla-assets.js
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const assetRoot = path.join(".cache", "vanilla-assets");
const extractedRoot = path.join(assetRoot, "assets");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Explorers-Eden-Wiki-Generator" } }, response => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode}: ${url}`));
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
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function download(url, file) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(file)) {
      resolve();
      return;
    }

    fs.mkdirSync(path.dirname(file), { recursive: true });

    const tempFile = `${file}.tmp`;
    const output = fs.createWriteStream(tempFile);

    https
      .get(url, { headers: { "User-Agent": "Explorers-Eden-Wiki-Generator" } }, response => {
        if (response.statusCode !== 200) {
          response.resume();
          output.close(() => {
            fs.rmSync(tempFile, { force: true });
            reject(new Error(`HTTP ${response.statusCode}: ${url}`));
          });
          return;
        }

        response.pipe(output);
        output.on("finish", () => {
          output.close(() => {
            fs.renameSync(tempFile, file);
            resolve();
          });
        });
      })
      .on("error", error => {
        output.close(() => {
          fs.rmSync(tempFile, { force: true });
          reject(error);
        });
      });
  });
}

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

function getLatestVersionFromReleaseInfo() {
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

function getPackFormatFallbackVersion() {
  if (!fs.existsSync("pack.mcmeta")) return null;

  try {
    const pack = JSON.parse(fs.readFileSync("pack.mcmeta", "utf8"));
    const format = Number(pack?.pack?.pack_format);

    if (format >= 80) return "1.21.8";
    if (format >= 71) return "1.21.6";
    if (format >= 61) return "1.21.4";
    if (format >= 48) return "1.21";
    if (format >= 41) return "1.20.6";
    if (format >= 26) return "1.20.2";
    if (format >= 15) return "1.20";
  } catch {
    return null;
  }

  return null;
}

async function resolveMinecraftVersion() {
  const requested =
    getLatestVersionFromReleaseInfo() ||
    getPackFormatFallbackVersion() ||
    "1.21.4";

  const manifest = await fetchJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");

  if (manifest.versions.some(version => version.id === requested)) {
    console.log(`Using Minecraft ${requested} from release_infos.yml`);
    return requested;
  }

  console.warn(`Minecraft version "${requested}" from release_infos.yml was not found. Falling back to latest release ${manifest.latest.release}.`);
  return manifest.latest.release;
}

function extractVanillaAssets(jarPath, versionId) {
  const marker = path.join(assetRoot, versionId, ".extracted-v5-full-block-model-baker");

  if (
    fs.existsSync(marker) &&
    fs.existsSync(path.join(extractedRoot, "minecraft", "blockstates", "chain.json")) &&
    fs.existsSync(path.join(extractedRoot, "minecraft", "blockstates", "lever.json")) &&
    fs.existsSync(path.join(extractedRoot, "minecraft", "blockstates", "oak_button.json")) &&
    fs.existsSync(path.join(extractedRoot, "minecraft", "models", "block", "chain.json")) &&
    fs.existsSync(path.join(extractedRoot, "minecraft", "models", "block", "lever.json")) &&
    fs.existsSync(path.join(extractedRoot, "minecraft", "textures", "block", "chain.png")) &&
    fs.existsSync(path.join(extractedRoot, "minecraft", "textures", "block", "lever.png")) &&
    fs.existsSync(path.join(extractedRoot, "minecraft", "textures", "block", "stone.png")) &&
    fs.existsSync(path.join(extractedRoot, "minecraft", "textures", "block", "oak_planks.png"))
  ) {
    console.log(`Vanilla block assets for ${versionId} already extracted.`);
    return;
  }

  fs.rmSync(extractedRoot, { recursive: true, force: true });
  fs.mkdirSync(assetRoot, { recursive: true });

  console.log("Extracting vanilla blockstates, block models, and block textures...");

  execFileSync(
    "unzip",
    [
      "-qq",
      "-o",
      jarPath,
      "assets/minecraft/blockstates/*",
      "assets/minecraft/models/block/*",
      "assets/minecraft/textures/block/*",
      "-d",
      assetRoot
    ],
    { stdio: "inherit" }
  );

  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, "ok\n");
}

async function main() {
  const versionId = await resolveMinecraftVersion();
  const manifest = await fetchJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
  const version = manifest.versions.find(entry => entry.id === versionId);

  if (!version) throw new Error(`Could not find Minecraft version ${versionId}`);

  const versionJson = await fetchJson(version.url);
  const clientUrl = versionJson.downloads?.client?.url;

  if (!clientUrl) throw new Error(`Could not find client jar for Minecraft ${versionId}`);

  const jarPath = path.join(assetRoot, versionId, "client.jar");
  await download(clientUrl, jarPath);
  extractVanillaAssets(jarPath, versionId);

  fs.writeFileSync(path.join(assetRoot, "version.txt"), `${versionId}\n`);
  console.log(`Vanilla assets ready for Minecraft ${versionId}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
