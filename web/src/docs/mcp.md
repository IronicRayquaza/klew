# MCP server

`klew mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio. Run it
from inside the repository you're working on. If that repository isn't indexed yet, it indexes it on first
start (about a second for 60 files), then warms up so the first call is as fast as the rest.

## Claude Code

Install the plugin. It adds the MCP server, pointed at your project, and a skill that tells Claude to call
`get_context` before reading files and `record_outcome` after editing:

```text
/plugin install klew --marketplace IronicRayquaza/klew
```

Or add just the server: `claude mcp add klew -- uvx klew mcp` from inside the repository.

## Claude Desktop

Download `klew.mcpb` from the [latest release](https://github.com/IronicRayquaza/klew/releases) and
double-click it. Claude Desktop asks for the repository folder, and optionally a HydraDB address and token.
It needs [uv](https://docs.astral.sh/uv/) installed.

## Cursor, Windsurf and other clients

Add a server entry to the client's MCP config. For Cursor that's `.cursor/mcp.json` in the repository:

```json
{
  "mcpServers": {
    "klew": {
      "command": "npx",
      "args": ["-y", "klew", "mcp"],
      "env": { "KLEW_REPO_ROOT": "/absolute/path/to/your-repo" }
    }
  }
}
```

The npm package is a small launcher that runs the Python package with `uvx`; `"command": "uvx", "args":
["klew", "mcp"]` works too.

Before first use, run `uvx klew hydra up` and `uvx klew index /path/to/your-repo` once.

## Tools

| Tool | Arguments | What it does |
|---|---|---|
| `get_context` | `task: str`, `budget_tokens: int = 2000`, `cutoff: float = 0` | Returns the files most likely to matter for the task, each with its why-path, signatures and a snippet, inside the budget. Starts with a `run_id`. `cutoff` stops early on weak candidates to save tokens ([trade-off](#docs/cli)). |
| `record_outcome` | `run_id: int`, `touched_files: list[str] \| None` | Tells the graph which files the run changed. Without `touched_files`, it uses the working tree's changed `.py` files from `git status`. Returns what it learned. |
| `explain` | `task: str`, `path: str` | Shows the learned links from the task's words to that file, with weights, hits and misses. |
| `graph_stats` | none | Counts of files, symbols, learned terms, runs, and edges by type. |

There is deliberately **no raw Cypher tool**, so an agent can't write arbitrary data into the graph.

## A typical session

```text
agent → get_context("Raise ReadTimeout when the server stalls while streaming")
      ← run_id: 567736201929104  (755/2000 tokens, 196 ms)
        ## httpx/_exceptions.py   score 13.81
        why: httpx/_exceptions.py
        seed: name match: httpx/_exceptions.py
          class ReadTimeout(TimeoutException)  # Timed out while receiving data from the host.
        ## httpx/_config.py   score 8.73
        why: httpx._config.Timeout.__init__ → defined in httpx/_config.py
        …
agent edits httpx/_models.py, httpx/_exceptions.py and httpx/_transports/default.py
agent → record_outcome(567736201929104)
      ← Learned from 3 file(s). Served and touched: ['httpx/_models.py', 'httpx/_exceptions.py'].
        Touched but not served: ['httpx/_transports/default.py']. Edges reinforced 4, created 20, decayed 0.
```

These are the real results of this exchange, recorded through the REST API (same engine) during
development. Scores, timings and the files chosen change as the graph learns and as defaults are tuned.

The server also sends these instructions to the agent: call `get_context` before reading files, and
`record_outcome` when done.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `KLEW_REPO_ROOT` | current directory | Repository to serve |
| `KLEW_REPO` | directory name | Graph key for the repository |
| `HYDRA_URI` | `bolt://127.0.0.1:7687` | HydraDB Bolt endpoint |
| `HYDRA_TOKEN` | local development token | HydraDB bearer token |
| `HYDRA_GRAPH` | `default` | HydraDB graph id |
