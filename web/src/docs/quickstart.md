# Quickstart

You need Docker, Python 3.11+ and [uv](https://docs.astral.sh/uv/) (or pip). Indexing a repo of about
60 files takes around a second.

## 1. Start HydraDB

```bash
git clone https://github.com/IronicRayquaza/klew && cd klew
docker compose up -d
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9090/readyz   # 200 when ready
```

This runs a single local HydraDB node from `ghcr.io/hydra-db/hydradb`, storing its data in a Docker
volume. It uses plaintext and a development token, so it's for local use only.

## 2. Install Klew

```bash
uv venv --python 3.12 .venv && uv pip install -e .
```

## 3. Index a repository

```bash
.venv/bin/klew index ~/code/your-repo
# indexed httpx: 60 files, 1240 symbols, 3821 edges in 2.8s; learned from 268 past commits
```

This parses every Python file with tree-sitter and mines up to 2,000 commits of git history for files that
change together. It then learns from the last 300 commits (warm start), which took about two minutes on httpx.
Everything is written to HydraDB. Use `--learn-history 0` to skip learning.

## 4. Ask for context

```bash
.venv/bin/klew context --repo your-repo "Support NO_PROXY environment variable with CIDR ranges"
```

You get a ranked list of files. Each one shows the path that connects it to the task, its most relevant
signatures, and a snippet, all within 2,000 tokens. Change the budget with `--budget 4000`.

## 5. Connect your agent

```bash
cd ~/code/your-repo
claude mcp add klew -- /path/to/klew/.venv/bin/klew mcp
```

The agent now has `get_context`, `record_outcome`, `explain` and `graph_stats`. For Cursor and other
clients, see [MCP server](#docs/mcp).

## 6. Let it learn

After a change lands, tell Klew which files were touched:

```bash
.venv/bin/klew learn-git HEAD~20..HEAD --path ~/code/your-repo --repo your-repo
```

Or add the [GitHub Action](#docs/github-action) and it learns from every merged PR automatically.

## 7. Open the dashboard (optional)

```bash
.venv/bin/klew serve                 # API on http://127.0.0.1:8000
cd web && npm install && npm run dev       # UI on http://127.0.0.1:5173
```
