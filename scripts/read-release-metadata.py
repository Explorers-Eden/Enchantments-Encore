import json
import os
import yaml

PACK_NAME = "Enchantments Encore"
ZIP_PREFIX = "enchantments_encore"
JAR_PREFIX = "enchantments-encore"

with open("release_infos.yml", "r", encoding="utf-8") as f:
    info = yaml.safe_load(f)

project_id = info.get("Project-ID")
game_versions = [str(v) for v in info.get("Meta Data", {}).get("Versions", [])]
details = info.get("Details", {})

version_type = str(details.get("Version type", "Release")).strip().lower()
version_number = str(details.get("Version number", "")).strip()
release_name = str(details.get("Version subtitle", "")).strip()

if version_type not in {"release", "beta", "alpha"}:
    raise ValueError("Version type must be Release, Beta, or Alpha")

changelog_path = next(
    (p for p in ["Changelog.log", "changelog.log"] if os.path.exists(p)),
    None,
)

if not project_id:
    raise ValueError("Project-ID missing in release_infos.yml")
if not game_versions:
    raise ValueError("Meta Data -> Versions missing in release_infos.yml")
if not version_number:
    raise ValueError("Details -> Version number missing in release_infos.yml")
if not release_name:
    raise ValueError("Details -> Version subtitle missing in release_infos.yml")
if not changelog_path:
    raise FileNotFoundError("Changelog.log or changelog.log missing")

outputs = {
    "project_id": project_id,
    "version_number": version_number,
    "mod_version_number": f"{version_number}-mod",
    "release_name": release_name,
    "mod_release_name": f"{release_name} - Universal Mod",
    "tag_name": f"v{version_number}",
    "zip_name": f"{ZIP_PREFIX}_{version_number}.zip",
    "jar_name": f"{JAR_PREFIX}-{version_number}.jar",
    "version_type": version_type,
    "is_prerelease": "true" if version_type in {"beta", "alpha"} else "false",
    "changelog_path": changelog_path,
    "game_versions_json": json.dumps(game_versions),
    "pack_name": PACK_NAME,
}

with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
    for key, value in outputs.items():
        out.write(f"{key}={value}\n")
