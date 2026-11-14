# CLI reference

Every command reads the HydraDB connection from `HYDRA_URI`, `HYDRA_TOKEN` and `HYDRA_GRAPH`
(see [MCP server → Environment](#docs/mcp)). Repository keys default to the directory name.

## `klew index [PATH]`

Builds the code graph for a repository. It parses every Python file with tree-sitter (symbols, signatures,
docstrings, calls, imports, inheritance, tests) and mines git history for files that change together. It
then learns from the repository's recent commits (warm start), so the graph is already trained before your
first query. Re-running it replaces the repository's graph.

| Option | Default | |
|---|---|---|
| `PATH` | `.` | Repository directory |
| `--name` | directory name | Repository key in the graph |
| `--history` | `2000` | Commits of git history to mine for co-change |
| `--learn-history` | `300` | Past commits to learn from at install (`0` turns warm start off) |

## `klew context TASK`

Prints the context pack for a task.

| Option | Default | |
|---|---|---|
| `--repo` | current directory name | Repository key |
| `--budget` | `2000` | Token budget for the pack |
| `--cutoff` | `0` | Stop adding files once they score below this fraction of the top file (saves tokens; see below) |
| `--json` | off | Print the full `ContextPack` as JSON |

### Spending fewer tokens

By default a pack uses its whole budget whenever that helps. `--cutoff` trades recall for tokens. Measured
on the first 50 httpx commits:

| `--cutoff` | Right file in context | Tokens used |
|---|---|---|
| `0` (default) | 90.3% | 1,694 |
| `0.05` | 87.7% | 1,529 (−10%) |
| `0.1` | 80.0% | 1,139 (−33%) |
| `0.2` | 71.7% | 858 (−49%) |

A smaller `--budget` is the other lever. The ranking is the same; only how much of it you take changes.

## `klew learn-git REV_RANGE`

Learns from commits. Each commit's message is treated as the task and the files it changed as the outcome.
This is what the [GitHub Action](#docs/github-action) runs on every merged PR. `REV_RANGE` is a range like
`HEAD~20..HEAD`, or a single commit sha.

| Option | Default | |
|---|---|---|
| `--path` | `.` | Repository directory |
| `--repo` | directory name | Repository key |

## `klew stats`

Prints counts of files, symbols, learned terms, runs, and edges by type. Option: `--repo`.

## `klew eval PATH`

Replays the repository's git history and compares approaches at a fixed token budget. See
[Evaluation](#docs/evaluation).

| Option | Default | |
|---|---|---|
| `--name` | directory name | Result name (writes `<out>/<name>.json`) |
| `--window` | `300` | Number of recent commits to replay |
| `--reindex-every` | `50` | Re-index the snapshot every N commits |
| `--budget` | `2000` | Token budget for every approach |
| `--arms` | `vector,bm25,graph_static,graph_learn,graph_hybrid` | Approaches to compare |
| `--warm` | `300` | Commits before the window that the learning approaches learn from at the start |
| `--out` | `eval/results` | Output directory |

The `vector` arm needs the extra dependency: `uv pip install -e ".[vector]"`.

## `klew plot RESULT`

Renders a result JSON to PNG charts (learning curve and tokens per correct file). Option: `--out`
(default `docs/img`). Needs `uv pip install -e ".[eval]"`.

## `klew serve`

Runs the [REST API](#docs/api). Options: `--host` (default `127.0.0.1`) and `--port` (default `8000`).

## `klew mcp`

Runs the [MCP server](#docs/mcp) on stdio.
