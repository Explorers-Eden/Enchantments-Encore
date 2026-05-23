import yaml

with open("release_infos.yml", "r", encoding="utf-8") as f:
    info = yaml.safe_load(f)

namespace = info["Namespace"]
name = info["Name"]

config = {
    "project_id_env": "CROWDIN_PROJECT_ID",
    "api_token_env": "CROWDIN_PERSONAL_TOKEN",
    "base_path": ".",
    "preserve_hierarchy": True,
    "files": [
        {
            "source": f"/assets/{namespace}/lang/en_us.json",
            "dest": f"/{name}.json",
            "translation": f"/assets/{namespace}/lang/%locale_with_underscore%.json",
        }
    ],
}

with open(".crowdin-temp.yml", "w", encoding="utf-8") as f:
    yaml.dump(config, f, default_flow_style=False, allow_unicode=True)

print(f"Created .crowdin-temp.yml for {name} (namespace: {namespace})")
