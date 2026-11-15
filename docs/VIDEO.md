# Demo video script (Loom, about 3:30)

Flow: the live site → the Playground → Klew vs vector RAG in the terminal → Klew inside Claude Code over MCP.
Terminal font 18pt+, browser zoom 110–125%. Real output only. Aggregate numbers are held-out, from
`eval/results/*.json` (`summary_held_out`, `ci_held_out`).

## Before recording (10 minutes)

```bash
# 1. Wake the live demo a minute ahead (free instance; first query after a wake-up is slow)
open https://klew-demo.onrender.com/#app

# 2. Local HydraDB for the terminal and Claude Code segments
docker compose up -d && curl -s http://127.0.0.1:9090/readyz

# 3. Klew vs RAG: the snapshot is already built (.klew/vsrag/); these just reuse it
.venv/bin/python scripts/vs_rag.py --list           # commits the graph has never seen
.venv/bin/python scripts/vs_rag.py --commit 359f77d4  # dry run of the showcase commit
.venv/bin/python scripts/vs_rag.py --all            # ~55 s; run once now so you know the result

# 4. Claude Code with Klew over MCP (local install; PyPI/npm aren't published yet)
cd .vendor/eval-repos/httpx && git status           # must be clean
claude mcp add klew -e KLEW_REPO=httpx -- "$(cd ../../.. && pwd)/.venv/bin/klew" mcp
claude                                              # check `/mcp` lists klew with 4 tools
```

Dry-run the Claude Code prompt once, then `git checkout .` in the httpx checkout. After recording:
`claude mcp remove klew`.

## Script

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | **Live site**, landing hero, URL bar visible. Toggle the hero between *Learning off* and *After 268 past commits*. | "Coding agents rediscover your repo every session: they grep, paste whole files, and burn tokens. Klew is an MCP server that hands them a small, token-budgeted map of the code that matters, built on a HydraDB graph, and it gets sharper with every merged PR. This hero is a real recorded run: green links are what the graph learned from past commits." |
| 0:15–0:45 | **Evidence** page: headline cards, the method table, **Key comparisons**, then the learning curve. | "We test on real git history: the commit message is the task, the files it changed are the answer, every approach gets the same 2,000 tokens. On held-out httpx commits the changed file lands in context 95% of the time against 58% for vector RAG, at about half the tokens per correct file, and every comparison has a 95% confidence interval. Learning is a significant gain on all three repos, including ODS, which we never tuned on." |
| 0:45–1:25 | **Playground**, live. Run *NO_PROXY CIDR ranges* (a few seconds on the free server). Open the inspector: **Evidence** chips and the **Thread**. Step to a walked file (e.g. `__init__.py`, "reached by the graph walk"). Open **Teach**, tick `httpx/_utils.py`, *Reinforce*, point at "+N reinforced". | "Every file comes with its reason. Evidence: the file name matches, and the graph learned that 'environment' points here. Files with no direct evidence are reached by walking the graph: imports, calls, tests, co-change. When a change lands, we tell Klew which files mattered. Learning is just edges in HydraDB: task words point to files, misses decay, and the code graph itself is never touched, so re-indexing never erases what it learned." |
| 1:25–2:15 | **Terminal**: `.venv/bin/python scripts/vs_rag.py --commit 359f77d4`, then show the `--all` result (run it on camera and cut, or show the output you ran before). | "Same thing head to head, on a commit the graph has never seen: we rebuilt it as of an earlier commit and replayed one that came later. The task is 'Clean up URL signature.' Vector RAG spends its whole budget on two files, neither of which changed. Klew's pack has all five changed files, the first at #1. And across all 60 commits after that point, with learning frozen: Klew gets 86% of the changed files into the pack, vector RAG 57%. Vector won 4 of them, mostly version bumps, so it's not magic, but it's a big, consistent gap." |
| 2:15–3:05 | **Claude Code** in the httpx checkout. Prompt: *"Call klew get_context with the task 'Support NO_PROXY environment variable with CIDR ranges'. Using that context, add CIDR support (e.g. NO_PROXY=10.0.0.0/8), then call record_outcome with the run_id and the files you edited."* Show the `get_context` call and its pack (`_utils.py` #1, `tests/test_utils.py` #2 when we checked), the edit, then `record_outcome`. Optional: *"Use klew explain: why is httpx/_utils.py relevant?"* | "Here's the real workflow. One MCP call gives the agent its context: no grepping, no whole files. The pack leads with `_utils.py`, where NO_PROXY is parsed, and its tests, so the agent goes there and makes the change. [Describe what it actually did.] Then `record_outcome` tells the graph which files mattered, which is the same learning a merged PR triggers through our GitHub Action. `explain` uses HydraDB's native path search to show the chain from the task to the file." |
| 3:05–3:30 | Back to the live site: landing install section, then the URL. | "It's open source and self-hosted on open-source HydraDB, with a CLI, the MCP server, a Claude Code plugin, a Desktop extension and a GitHub Action that learns on every merge. The cost is latency: a few hundred milliseconds per pack locally, versus milliseconds for a vector lookup. Try it at klew-demo.onrender.com." |

## Numbers used

| | httpx | flask | ODS (unseen) |
|---|---|---|---|
| Right file in context, Klew + vector seeds vs vector RAG (held-out) | 95.3 vs 58.1 | 91.6 vs 45.1 | 71.9 vs 35.0 |
| Tokens per correct file | 1,986 vs 3,392 | 2,087 vs 4,393 | 2,753 vs 5,557 |
| Learning on vs off, top-1 / MRR (points, all significant) | +6.0 / +6.7 | +6.1 / +7.4 | +7.8 / +6.9 |
| Learning curve, top-1 and MRR (0 → 600 learned; ODS 0 → 300) | 45.2 → 50.2, 57.0 → 63.0 | MRR 49.4 → 55.0 | 35.5 → 40.4, 48.3 → 52.0 |

Terminal segment (`scripts/vs_rag.py`, httpx, graph frozen at `3b9060ee` after learning from earlier commits,
60 later commits): changed files in the pack, Klew 86.1% vs vector RAG 56.5%; Klew ahead on 27, vector on 4,
tied on 29. `359f77d4` "Clean up URL signature": Klew 5/5 (first at #1), vector RAG 0/5.

Don't say "beats vector on every metric". Ranking vs vector with vector seeds is significant on httpx and
flask; on ODS only MRR is. The free hosted demo takes a few seconds per query; say so if it shows.
