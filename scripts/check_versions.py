"""Fail if the version differs anywhere it's declared (a mismatch breaks installs: the plugin and the
npm/Desktop launchers pin the PyPI version)."""
import json
import re
import sys
from pathlib import Path

found = {
    "pyproject.toml": re.search(r'^version = "([^"]+)"', Path("pyproject.toml").read_text(), re.M).group(1),
    "packages/npm/package.json": json.loads(Path("packages/npm/package.json").read_text())["version"],
    "packages/mcpb/package.json": json.loads(Path("packages/mcpb/package.json").read_text())["version"],
    "packages/mcpb/manifest.json": json.loads(Path("packages/mcpb/manifest.json").read_text())["version"],
    "plugins/klew/.claude-plugin/plugin.json": json.loads(Path("plugins/klew/.claude-plugin/plugin.json").read_text())["version"],
}
args = json.loads(Path("plugins/klew/.claude-plugin/plugin.json").read_text())["mcpServers"]["klew"]["args"]
pin = next((m.group(1) for a in args if (m := re.fullmatch(r"klew==(.+)", a))), None)
found["plugins/klew (uvx pin)"] = pin
if len(set(found.values())) != 1:
    for k, v in found.items():
        print(f"  {v:>10}  {k}")
    sys.exit("version mismatch")
print("versions consistent:", next(iter(found.values())))
