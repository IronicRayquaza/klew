# Evaluation

**Question:** at the same token budget, does Klew get the right code in front of an agent more
often than vector RAG, and does it get better as it learns?

## Method: git-history replay

`klew eval <repo>` takes the last 300 commits that modified 1–8 Python files and replays them in
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
| Klew, learning off | Klew's graph and walk, with learning switched off (the continual-learning baseline) |
| Klew without graph traversal | Klew with the graph walk and companions switched off: same seeds, learning and text fusion. This isolates what walking the HydraDB graph adds |
| Klew | the graph, learning from every replayed commit |
| Klew + vector seeds | the same, with the vector index as an extra seed source |

## Metrics

- **Right file in context:** the share of changed files that made it inside the 2,000-token pack. This is
  what the agent actually reads, so it's our headline.
- **Recall@5, recall@10, top-1, MRR:** how high the changed files rank, ignoring the budget.
- **Tokens per correct file:** context tokens spent for each changed file that got in.
- **Latency:** p50 per request.

## Held-out commits

Parameters were tuned on the first 100 commits of the httpx window (`scripts/tune.py`). Every result file
also reports `summary_held_out`, computed on the remaining commits only, and the [Results](#results) page
shows those by default. Runs are deterministic: the same inputs give the same numbers.

## Accuracy as the graph learns

`scripts/learning_curve.py` lets the graph learn from N past commits (0 to 600), then freezes learning
and measures the held-out commits. N = 0 is the same system with no learning. On httpx, right file in
context rises from 82.1% to 89.1%, recall@5 from 57.1% to 62.0% and MRR from 55.5% to 58.1%. On flask,
recall@5 rises from 52.4% to 55.3% and MRR from 48.5% to 51.8%. The chart is on the Results page.

## Results

The live tables and learning curves are on the [Results](#results) page. They're generated from
`eval/results/*.json` in the repository, which also holds every per-commit record.

## Limits, stated plainly

- Commit messages are terser than real agent prompts.
- We score Python files only, and static call resolution is best-effort.
- Parameters were tuned on the first 100 commits of httpx only. The held-out numbers exclude them.
- Held-out ranking: with vector seeds, Klew beats vector RAG on recall@5 on both repositories, and on
  top-1 and MRR on flask. On httpx it trails on top-1 (43.7% vs 47.2%) and MRR (60.7% vs 62.2%).
  Klew's clear win is what fits in the budget: the right file in context 89–95% vs 45–58%.
- The ablation shows the graph walk adds coverage (+2 to +5 points of right file in context) but currently
  costs precision at the top: without the walk, top-1 on httpx is 49.2% vs 40.7%. Using direct evidence
  for the head of the ranking and the walk to fill the rest is the next step.
- Latency is higher: about 0.2–0.4 s per request versus about 15 ms for a vector lookup.

## Reproduce

```bash
git clone https://github.com/encode/httpx .vendor/eval-repos/httpx
uv pip install -e ".[vector,eval]"
.venv/bin/klew eval .vendor/eval-repos/httpx --name httpx --window 300
.venv/bin/klew plot eval/results/httpx.json
```

It takes about 8 minutes on a laptop, most of it embedding chunks for the vector baseline.
