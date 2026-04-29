import json
import os
import requests

token = os.environ["MODRINTH_TOKEN"]
if not token:
    raise RuntimeError("MODRINTH_TOKEN secret is missing")

with open(os.environ["CHANGELOG_PATH"], "r", encoding="utf-8") as f:
    changelog = f.read()

file_name = os.environ["FILE_NAME"]
mime_type = os.environ.get("MIME_TYPE", "application/octet-stream")
upload_kind = os.environ.get("UPLOAD_KIND", "version")

payload = {
    "project_id": os.environ["PROJECT_ID"],
    "name": os.environ["RELEASE_NAME"],
    "version_number": os.environ["VERSION_NUMBER"],
    "changelog": changelog,
    "dependencies": [],
    "game_versions": json.loads(os.environ["GAME_VERSIONS_JSON"]),
    "version_type": os.environ["VERSION_TYPE"],
    "loaders": json.loads(os.environ["LOADERS_JSON"]),
    "featured": True,
    "status": "listed",
    "file_parts": ["file"],
    "primary_file": "file",
}

headers = {
    "Authorization": token,
    "User-Agent": "Explorers-Eden-Enchantments-Encore-GitHub-Action",
}

with open(file_name, "rb") as f:
    response = requests.post(
        "https://api.modrinth.com/v2/version",
        headers=headers,
        files={
            "data": (None, json.dumps(payload), "application/json"),
            "file": (file_name, f, mime_type),
        },
        timeout=300,
    )

if response.status_code >= 300:
    print(response.text)
    raise RuntimeError(f"Modrinth {upload_kind} upload failed: {response.status_code}")

print(f"Modrinth {upload_kind} version uploaded successfully")
