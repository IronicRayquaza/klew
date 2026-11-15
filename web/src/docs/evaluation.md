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

In plain words: Klew has a few knobs, such as how strongly to blend in text search. We set them using only
the earliest commits of httpx, locked them, and report results on the later commits, which we never looked
at while setting the knobs. It is like grading a student on questions that weren't in their practice set.
For httpx that means settings locked after September 2021 and measured on 199 commits from October 2021 to
February 2026. flask was never used for tuning at all.

Tuning is not the same as learning. Klew's graph keeps learning from every commit, but only after it has
answered it, the same way it would learn from a merged pull request. It never sees an answer before answering.

Parameters were tuned on the first 100 commits of the httpx window (`scripts/tune.py`). Every result file
also reports `summary_held_out`, computed on the remaining commits only, and the [Results](#results) page
shows those by default. Runs are deterministic: the same inputs give the same numbers.

## Accuracy as the graph learns

`scripts/learning_curve.py` lets the graph learn from N past commits, then freezes learning and measures
the held-out commits. N = 0 is the same system with no learning. On httpx (0 to 600 commits learned),
top-1 rises from 45.2% to 50.2%, MRR from 57.0% to 63.0%, recall@5 from 55.7% to 64.3% and right
file in context from 82.0% to 89.1%. On flask, recall@5 rises from 48.5% to 58.3% and MRR from
49.4% to 55.0%. On ODS, never used for tuning (0 to 300 commits learned), top-1 rises from 35.5% to 40.4%
and MRR from 48.3% to 52.0%. The charts are on the Results page.

## A third, unseen repository: ODS

To check that the settings transfer, we ran the same evaluation on
[Osmantic/ODS](https://github.com/Osmantic/ODS): 1,381 Python files, 25,944 symbols and about 82,000 graph
edges, roughly 20 times larger than httpx. No ODS commit was used for tuning. On 166 commits, Klew + vector
seeds put the right file in context 71.9% of the time vs 35.0% for vector RAG, with top-1
45.8% vs 39.2% and MRR 57.2% vs 51.3%. The ranking margins are smaller than on httpx, and two
costs grow with size: latency is about 0.9 s per request, and on this repo the graph walk spends budget less
efficiently (without the walk, the right file is in context 76.9% of the time at half the tokens).

## Results

The live tables and learning curves are on the [Results](#results) page. They're generated from
`eval/results/*.json` in the repository, which also holds every per-commit record.

## Limits, stated plainly

- Commit messages are terser than real agent prompts.
- We score Python files only, and static call resolution is best-effort.
- Parameters were tuned on the first 100 commits of httpx only. The held-out numbers exclude them.
- The clearest result is what fits in the budget: the right file in context 72–95% vs 35–58%, 31–47 points
  ahead of vector RAG on every repository, all statistically significant (paired 95% bootstrap intervals).
- Ranking is closer. With vector seeds, Klew beats vector RAG significantly on httpx and flask; on ODS only
  MRR is significant. Without vector seeds, Klew's ranking is level with vector RAG on httpx and ODS.
- Learning significantly improves recall@5, top-1 and MRR on all three repositories.
- The ablation shaped the design. The graph walk adds coverage (more right files in context) but, used
  alone to order the list, it cost precision at the top. Klew now ranks in two stages: direct evidence
  (task words, learned links, text) picks the top five files, and the walk fills the rest of the budget.
- Latency is higher: about 0.3 s per request on httpx and 0.9 s on ODS, versus about 15–45 ms for a vector
  lookup.

## Reproduce

```bash
git clone https://github.com/encode/httpx .vendor/eval-repos/httpx
uv pip install -e ".[vector,eval]"
.venv/bin/klew eval .vendor/eval-repos/httpx --name httpx --window 300
.venv/bin/klew plot eval/results/httpx.json
```

It takes about 8 minutes on a laptop, most of it embedding chunks for the vector baseline.
