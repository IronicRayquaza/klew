# Demo video script (≤ 3:00)

Record at 1440p, terminal font 18pt+, browser zoom 125%. Use real output only. Every number on screen
comes from `eval/results/*.json` or from a live command.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:20 | Landing hero | "Coding agents rediscover your repo every session: they grep, paste whole files, and burn tokens. Desirepath gives them a small map of the code that matters, and it gets sharper with every merged PR." |
| 0:20–0:45 | Terminal: `desirepath index .vendor/eval-repos/httpx --name httpx`, then `desirepath context --repo httpx "Support NO_PROXY environment variable with CIDR ranges"` | "It parses the repo into a code graph in HydraDB: symbols, calls, tests, imports, and which files change together. For a task it walks that graph and returns signatures and the right snippet, each with the path that justifies it, inside a token budget." |
| 0:45–1:15 | Claude Code with the MCP server: the agent calls `get_context`, edits, then calls `record_outcome` | "Here's Claude Code using it over MCP. One call returns the context. When the change lands, `record_outcome` tells the graph which files actually mattered." |
| 1:15–1:40 | Dashboard `#app`: run a task, show the why-path graph, tick "I changed this", record the outcome, run again | "Learning is just edges. Words in the task point to the files that changed, and files we served that didn't matter decay. Structure stays fact; experience is learned on top. No re-embedding, no re-index." |
| 1:40–2:25 | `#results`: the learning curve, then the table | "We replayed 300 real commits of httpx, plus flask. Every approach gets the same 2,000 tokens. Desirepath gets the changed file into context X% of the time against Y% for vector RAG, with Z× fewer tokens per correct file. And the same graph with learning turned off is N points lower: that's the 'sharper every run'." |
| 2:25–2:45 | `queries.py`, then `walker.py` | "HydraDB holds the graph and does the traversal: anchored one-hop expansions per edge type, about 34 queries and 200 ms per pack. Learning writes weights back in place with batched MERGE." |
| 2:45–3:00 | Landing: install + plans | "Open source today, with a GitHub Action that learns from every merge. Next: a shared team graph on HydraDB object storage, so every engineer's merges sharpen everyone's agent." |

Fill X, Y, Z and N from `eval/results/httpx.json` → `summary`.
