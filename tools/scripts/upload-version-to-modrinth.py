import json
import os
import requests

token = os.environ["MODRINTH_TOKEN"]
if not token:
    raise RuntimeError("MODRINTH_TOKEN secret is missing")

with open(os.environ["CHANGELOG_PATH"], "r", encoding="utf-8") as f:
    changelog = f.read()

file_name = os.environ["FILE_NAME"]
file_mime_type = os.environ["FILE_MIME_TYPE"]
label = os.environ.get("MODRINTH_UPLOAD_LABEL", "version")

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

with open(file_name, "rb") as f:
    response = requests.post(
        "https://api.modrinth.com/v2/version",
        headers={
            "Authorization": token,
            "User-Agent": "Explorers-Eden-GitHub-Action",
        },
        files={
            "data": (None, json.dumps(payload), "application/json"),
            "file": (file_name, f, file_mime_type),
        },
        timeout=300,
    )

if response.status_code >= 300:
    print(response.text)
    raise RuntimeError(f"Modrinth {label} upload failed: {response.status_code}")

print(f"Modrinth {label} version uploaded successfully")
