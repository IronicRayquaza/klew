# Publishing Klew

Klew ships in four forms that share one Python package:

| Form | Where | Install |
|---|---|---|
| Python package (CLI, MCP server, engine) | PyPI `klew` | `pip install klew` / `uvx klew` |
| npm launcher (runs the PyPI package via uvx) | npm `klew` | `npx -y klew mcp` |
| Claude Code plugin (MCP server + skill) | this repo (`.claude-plugin/marketplace.json`) | `/plugin install klew --marketplace IronicRayquaza/klew` |
| Claude Desktop extension | `klew.mcpb` attached to a GitHub release | double-click the file |

Order matters: the plugin, npm launcher and Desktop extension all run `klew==<version>` from PyPI, so
**publish PyPI first**. The repository must be public before the plugin marketplace and README links work.

## 1. Build and check everything

```bash
scripts/build_release.sh      # version check, wheel + sdist, klew.mcpb, npm dry-run, plugin validation
```

`scripts/check_versions.py` (also run in CI) fails if the version differs between `pyproject.toml`,
`packages/npm/package.json`, `packages/mcpb/{package,manifest}.json`, `plugins/klew/.claude-plugin/plugin.json`
and the plugin's `uvx` pin.

## 2. PyPI

Create an API token at https://pypi.org/manage/account/token/ (scope: entire account for the first upload),
then:

```bash
UV_PUBLISH_TOKEN=pypi-… uv publish dist/klew-0.1.0-py3-none-any.whl dist/klew-0.1.0.tar.gz
uvx --refresh klew --help      # confirm it installs from PyPI
```

## 3. npm

```bash
npm login                      # once
cd packages/npm && npm publish --access public
npx -y klew --help             # confirm
```

## 4. Claude Desktop extension

```bash
gh release create v0.1.0 dist/klew.mcpb --title "Klew 0.1.0" --notes "First release"
```

Users download `klew.mcpb` from the release page and double-click it; Claude Desktop asks for the repository
folder. They need uv and Docker, and run `uvx klew hydra up` and `uvx klew index <repo>` once.

## 5. Claude Code plugin

Nothing to upload: once the repo is public, users run

```text
/plugin install klew --marketplace IronicRayquaza/klew
```

or `/plugin marketplace add IronicRayquaza/klew` and then `/plugin install klew@klew`.

## Releasing a new version

Bump the version in all five places (the check lists them), run `scripts/build_release.sh`, then repeat
steps 2–4 with the new version number.
