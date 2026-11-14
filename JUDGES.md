# Judge guide: Klew in five minutes

**Tracks:** both. *A graph that improves itself* (learned `POINTS_TO` / `CO_CHANGED` edges, updated from
every run and merged PR) and *the context layer for agents* (an MCP server that walks the graph instead of
pasting chunks).

## 1. The claim, and where it's proven

| Claim | Where to check |
|---|---|
| Puts the right file in the agent's context more often than vector RAG, at the same 2k-token budget | `eval/results/*.json` → `summary.*.budget_recall`; the README table; the `#results` page |
| Spends fewer tokens per correct file | `summary.*.tokens_per_hit` |
| Gets sharper every run | `graph_learn` vs `graph_static`: same graph, learning on or off. Compare `curves` and first-half vs second-half recall |
| Learns without re-embedding or re-indexing | `klew/domain/learning.py`; `tests/test_domain.py::test_learning_*` |
| Every file comes with a reason | `ContextItem.why` in any pack; the force graph on the `#app` page |

## 2. Reproduce (about 10 minutes on a laptop)

```bash
docker compose up -d
uv venv --python 3.12 .venv && uv pip install -e ".[dev,vector,eval]"
git clone https://github.com/encode/httpx .vendor/eval-repos/httpx
.venv/bin/klew eval .vendor/eval-repos/httpx --name httpx --window 300
.venv/bin/klew plot eval/results/httpx.json
```

## 3. Try it as an agent would

```bash
.venv/bin/klew index .vendor/eval-repos/httpx --name httpx
.venv/bin/klew context --repo httpx "Support NO_PROXY environment variable with CIDR ranges"
cd .vendor/eval-repos/httpx && claude mcp add klew -- "$OLDPWD/.venv/bin/klew" mcp
```

## 4. HydraDB usage worth a look

- `klew/adapters/queries.py`: every statement, with the dialect rules we verified (batch upserts,
  anchored `WHERE id IN $ids` expansions, relationship weights read in place).
- `klew/domain/walker.py`: traversal runs in HydraDB one hop at a time. The Python side only
  scores and keeps back-pointers.
- `tests/test_store_contract.py`: the same contract runs against HydraDB and an in-memory reference store.

## 5. What we did not do

- Python repositories only. Tree-sitter grammars for TypeScript and Go are the obvious next step.
- No hosted multi-tenant graph yet. The "team graph" plan is a proposal.
- Commit messages stand in for agent prompts in the eval. The MCP loop itself is real and works end to end.
