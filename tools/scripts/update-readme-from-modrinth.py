import json
import os
import urllib.request

project_id = os.environ["PROJECT_ID"]

req = urllib.request.Request(
    f"https://api.modrinth.com/v2/project/{project_id}",
    headers={"User-Agent": "Explorers-Eden-GitHub-Action"},
)
with urllib.request.urlopen(req) as resp:
    project = json.loads(resp.read())

body = project.get("body", "") or ""
if not body.endswith("\n"):
    body += "\n"

with open("README.md", "w", encoding="utf-8") as f:
    f.write(body)
