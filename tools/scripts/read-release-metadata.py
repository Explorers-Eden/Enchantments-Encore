import json
import os
import urllib.request
import yaml

with open("tools/release_infos.yml", "r", encoding="utf-8") as f:
    info = yaml.safe_load(f)

mod_id = info.get("Mod-ID")
namespace = info.get("Namespace")
slug = info.get("Slug")
name = info.get("Name")
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

for field, value in [
    ("Mod-ID", mod_id),
    ("Namespace", namespace),
    ("Slug", slug),
    ("Name", name),
    ("Project-ID", project_id),
]:
    if not value:
        raise ValueError(f"{field} missing in release_infos.yml")

if not game_versions:
    raise ValueError("Meta Data -> Versions missing in release_infos.yml")
if not version_number:
    raise ValueError("Details -> Version number missing in release_infos.yml")
if not release_name:
    raise ValueError("Details -> Version subtitle missing in release_infos.yml")
if not changelog_path:
    raise FileNotFoundError("Changelog.log or changelog.log not found")

req = urllib.request.Request(
    f"https://api.modrinth.com/v2/project/{project_id}",
    headers={"User-Agent": "Explorers-Eden-GitHub-Action"},
)
with urllib.request.urlopen(req) as resp:
    project = json.loads(resp.read())
description = project.get("description", "")

icon = f"{slug}_pack.png"
zip_prefix = slug.replace("-", "_")

outputs = {
    "project_id": project_id,
    "mod_id": mod_id,
    "namespace": namespace,
    "slug": slug,
    "name": name,
    "description": description,
    "icon": icon,
    "version_number": version_number,
    "mod_version_number": f"{version_number}-mod",
    "release_name": release_name,
    "mod_release_name": f"{release_name} - Universal Mod",
    "tag_name": f"v{version_number}",
    "zip_name": f"{zip_prefix}_{version_number}.zip",
    "jar_name": f"{slug}-{version_number}.jar",
    "version_type": version_type,
    "is_prerelease": "true" if version_type in {"beta", "alpha"} else "false",
    "changelog_path": changelog_path,
    "game_versions_json": json.dumps(game_versions),
}

with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
    for key, value in outputs.items():
        out.write(f"{key}={value}\n")
