# Evaluation

**Question:** at the same token budget, does Desirepath get the right code in front of an agent more
often than vector RAG, and does it get better as it learns?

## Method: git-history replay

`desirepath eval <repo>` takes the last 300 commits that modified 1–8 Python files and replays them in
order:

- the **task** is the commit message;
- the **answer** is the set of `.py` files the commit modified that exist in the code snapshot;
- every approach gets the **same 2,000-token budget**;
- the code is **re-indexed at the parent commit every 50 commits**, so nothing ever sees the future;
- the learning approaches learn from each commit only **after** answering it, exactly as they would from a
  merged PR.

## Approaches compared

| Approach | |
|---|---|
| Vector RAG | `bge-small-en-v1.5` embeddings over 40-line chunks, cosine top-k, packed to the budget (local, via fastembed) |
| BM25 RAG | BM25 over the same chunks |
| Graph, no learning | Desirepath's graph and walk, with learning switched off |
| Desirepath | the graph, learning from every replayed commit |
| Desirepath + vector seeds | the same, with the vector index as an extra seed source |

## Metrics

- **Right file in context:** the share of changed files that made it inside the 2,000-token pack. This is
  what the agent actually reads, so it's our headline.
- **Recall@5, recall@10, top-1, MRR:** how high the changed files rank, ignoring the budget.
- **Tokens per correct file:** context tokens spent for each changed file that got in.
- **Latency:** p50 per request.

## Results

The live tables and learning curves are on the [Results](#results) page. They're generated from
`eval/results/*.json` in the repository, which also holds every per-commit record.

## Limits, stated plainly

- Commit messages are terser than real agent prompts.
- We score Python files only, and static call resolution is best-effort.
- Parameters were tuned on the first 50 commits of httpx only (`scripts/tune.py`). Everything else is
  held out.
- On its own, without vector seeds, Desirepath still ranks the single best file first slightly less often
  than vector RAG on httpx. With vector seeds, it beats vector RAG on every quality metric on both repositories.
- Latency is higher: about 350 ms per request versus about 15 ms for a vector lookup.

## Reproduce

```bash
git clone https://github.com/encode/httpx .vendor/eval-repos/httpx
uv pip install -e ".[vector,eval]"
.venv/bin/desirepath eval .vendor/eval-repos/httpx --name httpx --window 300
.venv/bin/desirepath plot eval/results/httpx.json
```

It takes about 8 minutes on a laptop, most of it embedding chunks for the vector baseline.
