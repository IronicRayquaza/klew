# Klew

> A *clew* is the ball of thread Ariadne gave Theseus to find his way through the labyrinth. It's where
> the word *clue* comes from.

Klew is a **context layer for coding agents**. It maps your repository as a graph in
[HydraDB](https://github.com/hydra-db/hydradb). When an agent starts a task, it hands over a small,
token-budgeted map of the code that matters, with the path through the code that justifies every file.
Each merged PR then teaches the graph which paths were right.

## The problem

Every session, a coding agent rediscovers your repository from scratch. It greps, opens whole files, and
pastes 40-line chunks that look like the task. That costs tokens, and it still misses the file that
matters when that file doesn't *look* like the task: the caller, the test, the config two hops away.

## What Klew does instead

| | Vector RAG | Klew |
|---|---|---|
| Finds code by | text similarity to the task | names in the task, then following calls, callers, tests, imports and co-changes |
| Gives the agent | top-k chunks | signatures plus the best snippet per file, inside your token budget |
| Explains itself | a cosine score | a path: `seed → called by → defined in file` |
| Gets better | when you re-embed | after every run and every merged PR, by updating edge weights in place |

## The numbers

We replay about 300 real commits from each of [httpx](https://github.com/encode/httpx) and
[flask](https://github.com/pallets/flask), in order. Every approach gets the same 2,000-token budget.
Klew gets the changed file into the agent's context far more often than vector RAG, and spends about
half the tokens per correct file. The live numbers and charts are on the [Results](#results) page, and the
method is in [Evaluation](#docs/evaluation).

## Ways to use it

- **[MCP server](#docs/mcp)** for Claude Code, Cursor, Windsurf, or any MCP client.
- **[CLI](#docs/cli)** to index, query, learn from git, evaluate, and serve.
- **[REST API](#docs/api)** behind the dashboard, for your own tools.
- **[GitHub Action](#docs/github-action)** so every merged PR teaches the graph.
- **[Python library](#docs/library)** to embed the engine directly.

Start with the [Quickstart](#docs/quickstart).
