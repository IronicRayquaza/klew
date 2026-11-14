# Architecture

```text
interfaces   mcp_server.py │ api.py │ cli.py                 thin: validate → call engine → serialize
application  RepoEngine (get_context, record_outcome) · IndexService · replay eval
domain       seeder · walker · packer · learning rule · BM25  pure Python, no I/O, unit-tested
ports        GraphStore protocol
adapters     HydraGraphStore (Bolt) · MemoryGraphStore · tree-sitter reader · git miner · tokens
```

- The domain never imports a driver; it only sees `GraphStore`.
- The same contract test runs against HydraDB and the in-memory store, so the HydraDB adapter is checked
  against a reference implementation in CI, on a real HydraDB node.
- Every Cypher statement lives in one file, `desirepath/adapters/queries.py`.

## How we use HydraDB

| Need | How |
|---|---|
| Typed code graph | five node labels and nine edge types (see [How it works](#docs/concepts)) |
| Bulk writes | `UNWIND $rows AS row MERGE (n {id: row.id}) SET n:DpSymbol, …` in batches of 1,000; edges `MERGE` with a deterministic edge id, so every write is idempotent |
| Traversal | one anchored 1-hop expansion per edge type and direction: `MATCH (a:DpSymbol)<-[r:CALLS]-(b) WHERE a.id IN $ids RETURN a.id, b.id, r.w` |
| Learning | weights written back in place with batched `MERGE … SET r.w, r.hits, r.misses` |
| Audit trail | each request is a `DpRun` node with `SERVED` and `TOUCHED` edges |
| Explanations | `algo.SPpaths` is available through `GraphStore.shortest_paths` |

A context pack on httpx takes about 20–35 queries and 150–350 ms on a laptop. Indexing writes about
30,000 vertices per second.

## HydraDB dialect notes

We verified these against HydraDB v0.4.0 (legacy engine) while building:

- Use auto-commit `session.run`. Explicit transactions (`driver.execute_query`) are rejected.
- Vertex batches must `MERGE` on id alone, then `SET` the label and properties.
- Relationship `MERGE` inside `UNWIND` needs an `id` on the relationship.
- A list-of-maps parameter only works as `UNWIND` input, so batched reads use `WHERE a.id IN $ids`.
- Relationship properties are readable when the far node is unlabeled. `r.id` is identity, not a readable
  property.
- There's no `type()`, `labels()`, `coalesce`, `ON CREATE`, or list-valued properties, and each pattern
  takes exactly one relationship type.
