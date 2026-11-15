# klew-mcp (npm launcher for Klew)

Klew gives coding agents a small, token-budgeted map of the code that matters for a task, found by walking
a code graph in [HydraDB](https://github.com/hydra-db/hydradb). It learns from every merged PR.

This npm package is a thin launcher for the Python package [`klew`](https://pypi.org/project/klew/). It
runs it with [uv](https://docs.astral.sh/uv/) (`uvx`), falling back to `pipx` or an installed `klew`.

```bash
npx -y klew-mcp hydra up          # start a local HydraDB node (Docker)
npx -y klew-mcp index .           # index the current repository
npx -y klew-mcp mcp               # MCP server on stdio
```

MCP client config (Cursor, Claude Desktop, Windsurf, …):

```json
{ "mcpServers": { "klew": { "command": "npx", "args": ["-y", "klew-mcp", "mcp"],
                            "env": { "KLEW_REPO_ROOT": "/absolute/path/to/your/repo" } } } }
```

Requires Node 18+, uv (or pipx), and Docker for the local HydraDB node. Docs and results:
https://github.com/IronicRayquaza/klew
