# Demo video script (Loom, ≤ 3:00)

Record locally (about 0.3 s per query; the free hosted demo takes about 8 s), then show the live link at the
end. Terminal font 18pt+, browser zoom 125%. Use real output only. Every number below is held-out, from
`eval/results/*.json` (`summary_held_out`, `ci_held_out`); re-run `scripts/readme_results.py` if they change.

## Before recording

```bash
docker compose up -d && curl -s http://127.0.0.1:9090/readyz          # HydraDB
.venv/bin/klew serve                                                   # API on :8000
cd web && npm run dev                                                  # site on :5173
# Claude Code segment: from inside the httpx checkout
cd .vendor/eval-repos/httpx && git status                              # clean tree
claude mcp add klew -e KLEW_REPO=httpx -- "$PWD/../../../.venv/bin/klew" mcp
```

Dry-run the Claude Code task once (then `git checkout .`), so the take is smooth. Afterwards remove the
server with `claude mcp remove klew`.

## Script

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | Landing hero | "Coding agents rediscover your repo every session: they grep, paste whole files, and burn tokens. Klew gives them a small map of the code that matters, and it gets sharper with every merged PR." |
| 0:15–0:40 | Terminal: `klew context --repo httpx "Support NO_PROXY environment variable with CIDR ranges"` | "Klew parses the repo into a code graph in HydraDB: symbols, calls, tests, imports, and which files change together. For a task it returns signatures and the right snippet, each with the path that justifies it, inside a 2,000-token budget." |
| 0:40–1:10 | Claude Code in the httpx checkout. Prompt: *"Use klew to find where NO_PROXY is handled, then add CIDR support."* Show the `get_context` call, the edit, `record_outcome`, then ask *"Explain why _utils.py was relevant"* → `explain` | "One MCP call gives the agent its context. When the change lands, `record_outcome` tells the graph which files mattered. `explain` asks HydraDB's native path search, MSpaths, for the chain: `_get_proxy_map` calls `get_environment_proxies`, which lives in `_utils.py`." |
| 1:10–1:30 | Dashboard `#app`: run a task, show the why-path graph, tick "I changed this", record, run again | "Learning is just edges. Words in the task point to the files that changed; files we served that didn't matter decay. Structural edges stay facts; experience is a separate, learned layer, so re-indexing never erases it." |
| 1:30–2:20 | `#results`: held-out toggle, the table, Comparisons panel, then the learning curve | "We replayed real commit history: the commit message is the task, the changed files are the answer, every approach gets the same 2,000 tokens. We tuned on the first 100 httpx commits only and report the rest, plus flask and ODS, which we never tuned on. The right file lands in context 95% of the time on httpx against 58% for vector RAG, 92 vs 45 on flask, 72 vs 35 on the unseen ODS, at about half the tokens per correct file. Learning on versus off is a significant gain in top-1 and MRR on all three repos, and the curve shows it: on httpx, top-1 goes from 45 to 50% and MRR from 57 to 63 as the graph learns. Every comparison has a paired 95% interval; ranking against vector is closer, significant on httpx and flask." |
| 2:20–2:45 | `klew/schema.py` (edge types), then `klew/adapters/queries.py` (`ms_paths`) | "HydraDB does the graph work: typed structural edges, learned POINTS_TO and CO_CHANGED edges updated in place with batched MERGE, parallel one-hop expansions for the walk, and MSpaths for explanations. The cost is latency: about 0.3 s per pack versus 15 ms for a vector lookup." |
| 2:45–3:00 | Landing install section, then the live URL | "It's open source: `pip install klew`, an npm launcher, a Claude Code plugin, a Desktop extension, and a GitHub Action that learns from every merge. Next is a shared team graph on HydraDB, so every engineer's merges sharpen everyone's agent. Try it at [live URL]." |

## Numbers used (held-out)

| | httpx | flask | ODS (unseen) |
|---|---|---|---|
| Right file in context, Klew + vector seeds vs vector RAG | 95.3 vs 58.1 | 91.6 vs 45.1 | 71.9 vs 35.0 |
| Tokens per correct file | 1,986 vs 3,392 | 2,087 vs 4,393 | 2,753 vs 5,557 |
| Learning on vs off, top-1 / MRR (points, all significant) | +6.0 / +6.7 | +6.1 / +7.4 | +7.8 / +6.9 |
| Learning curve, top-1 and MRR (0 → 600 learned; ODS 0 → 300) | 45.2 → 50.2, 57.0 → 63.0 | MRR 49.4 → 55.0 | 35.5 → 40.4, 48.3 → 52.0 |

Don't say "beats vector on every metric". Ranking vs vector with vector seeds is significant on httpx and
flask; on ODS only MRR is.
