# Quickstart

You need Docker, Python 3.11+ and [uv](https://docs.astral.sh/uv/) (or pip). Indexing a repo of about
60 files takes around a second.

## 1. Install Klew

```bash
pip install klew          # or prefix every command with uvx: uvx klew …
```

## 2. Start HydraDB

```bash
klew hydra up             # starts a local HydraDB node in Docker (first run pulls the image)
klew hydra status         # "ready on bolt://127.0.0.1:7687"
```

This runs a single local HydraDB node from `ghcr.io/hydra-db/hydradb`, storing its data in a Docker volume
that survives `klew hydra down`. It uses plaintext and a development token, so it's for local use only.

## 3. Index a repository

```bash
klew index ~/code/your-repo
# indexed httpx: 60 files, 1240 symbols, 3821 edges in 2.8s; learned from 268 past commits
```

This parses every Python file with tree-sitter and mines up to 2,000 commits of git history for files that
change together. It then learns from the last 300 commits (warm start), which took about two minutes on httpx.
Everything is written to HydraDB. Use `--learn-history 0` to skip learning.

## 4. Ask for context

```bash
klew context --repo your-repo "Support NO_PROXY environment variable with CIDR ranges"
```

You get a ranked list of files. Each one shows the path that connects it to the task, its most relevant
signatures, and a snippet, all within 2,000 tokens. Change the budget with `--budget 4000`.

## 5. Connect your agent

In Claude Code, install the plugin:

```text
/plugin install klew --marketplace IronicRayquaza/klew
```

The agent now has `get_context`, `record_outcome`, `explain` and `graph_stats`, plus a skill that tells it
when to use them. For Claude Desktop, Cursor and other clients, see [MCP server](#docs/mcp).

## 6. Let it learn

After a change lands, tell Klew which files were touched:

```bash
klew learn-git HEAD~20..HEAD --path ~/code/your-repo --repo your-repo
```

Or add the [GitHub Action](#docs/github-action) and it learns from every merged PR automatically.

## 7. Open the dashboard (optional, from a source checkout)

```bash
git clone https://github.com/IronicRayquaza/klew && cd klew
uv pip install -e .
klew serve                                 # API on http://127.0.0.1:8000
cd web && npm install && npm run dev       # UI on http://127.0.0.1:5173
```
