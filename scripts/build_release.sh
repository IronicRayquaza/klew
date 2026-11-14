#!/usr/bin/env bash
# Build every release artifact into dist/: wheel + sdist (PyPI), klew.mcpb (Claude Desktop), npm tarball check.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/check_versions.py
rm -rf dist && uv build
cp packages/npm/bin/klew.js packages/mcpb/server/index.js        # one launcher for npm and Desktop
npx -y @anthropic-ai/mcpb@2.1.2 validate packages/mcpb/manifest.json
npx -y @anthropic-ai/mcpb@2.1.2 pack packages/mcpb dist/klew.mcpb
(cd packages/npm && npm pack --dry-run)
claude plugin validate . >/dev/null && claude plugin validate plugins/klew >/dev/null && echo "plugin + marketplace valid"
ls -la dist
