---
name: klew
description: Use Klew's code graph to find the files that matter before changing code in this repository, and record what changed afterwards so the graph learns. Use for any task that will read or edit code in the current project.
---

# Working with Klew

Klew maps this repository as a graph in HydraDB and remembers which files mattered for past tasks.

**Before reading files for a task**, call the `get_context` tool from the `klew` MCP server with the task in
one or two sentences. It returns the files and symbols most likely to matter, each with the path through the
code that connects it to the task, inside a token budget (`budget_tokens`, default 2000). Read those first;
search further only if they aren't enough.

**After you finish editing**, call `record_outcome` with the `run_id` from `get_context`. With no
`touched_files`, it uses the working tree's changed `.py` files. This is how Klew gets sharper on this repo.

`explain(task, path)` shows why a file was chosen; `graph_stats()` shows what the graph holds.

## First-time setup

Klew needs a running HydraDB node and an index of the repository. If the tools report that HydraDB is
unreachable or the repository isn't indexed, tell the user to run, in a terminal at the project root:

```bash
uvx klew hydra up     # local HydraDB in Docker
uvx klew index .      # build the graph and learn from recent history (a minute or two)
```

Klew indexes Python files today.
