# How it works

Klew does three things: **map** the repository, **walk** it for each task, and **learn** from what
actually changed.

## Map

`klew index` parses every Python file with tree-sitter and writes a typed graph to HydraDB:

| Node | What it is |
|---|---|
| `KlewFile` | a source file: path, size in tokens, whether it's a test |
| `KlewSymbol` | a class, function, method or test: qualified name, signature, first docstring line, line span, distinctive body words |
| `KlewTerm` | a word from a task, created when the graph learns |
| `KlewRun` | one context request: the task, what was served, what was touched |
| `KlewRepo` | an indexed repository |

| Edge | From → to | Kind |
|---|---|---|
| `CONTAINS` | file → symbol | structure |
| `IMPORTS` | file → file | structure |
| `CALLS`, `TESTS`, `INHERITS` | symbol → symbol | structure (resolved statically through each file's imports) |
| `CO_CHANGED` | file → file | mined from git history, then learned |
| `POINTS_TO` | task word → file | learned |
| `SERVED`, `TOUCHED` | run → file | provenance |

Structure is fact: it only changes when the code changes. Experience lives in the learned edges, so
re-indexing never erases what the graph has learned.

## Walk

For a task, Klew:

1. **Seeds** from the task text: BM25 over symbol names, docstrings and distinctive body words, exact
   identifiers (`Client.send`, `ReadTimeout`), and learned `POINTS_TO` links from the task's words.
2. **Walks** outward in HydraDB one hop at a time: calls, callers, tests, inheritance, imports, the file a
   symbol lives in, and files that change together. Each hop is one anchored query per edge type, so the
   traversal runs where the graph lives. Relevance decays with every hop, and each node remembers the hop
   that first reached it, which becomes its **why-path**.
3. **Ranks** files by the relevance that reached them, divided by `(1 + ln(1 + symbols in file))^0.5`. Large
   central files otherwise collect relevance from everywhere and win by default.
4. **Adds companions**: for the top three files, it pulls in their test file (matched by name) and their
   strongest co-change partner at 0.4× the parent's score. A change to one file usually touches those too,
   and each companion's why-path says so (`tested in`, `changes with`).
5. **Fuses** the ranking with a plain text ranker (reciprocal rank fusion, k = 20): BM25 over full file
   text by default, or vector search when it's configured. The graph's own #1 is kept, and the rest is
   reordered so files that both rankers like rise. The graph finds structure; text catches wording the
   graph can't see.
6. **Ranks in two stages.** The top five files come from direct evidence only (the seeds, learned links
   and text fusion, with no walk), because that is most precise at the head of the list. The walk's ranking
   fills the rest. This costs no extra queries.
7. **Packs** the budget greedily, up to 30 files: for each file, its header, its most relevant signatures,
   and (for the top files) the best snippet. Long signatures are trimmed. If nothing matches the task, it
   **abstains** rather than guess.

## Learn

When an outcome arrives (`record_outcome`, `learn-git`, or the GitHub Action):

- each word of the task gets its `POINTS_TO` link to each touched file strengthened:
  `w ← w + 0.35 · (1 − w)`;
- links to files that were served but not touched are weakened: `w ← w · 0.85`;
- touched files that were never served get new links, which is how the graph fills its gaps;
- files touched together strengthen their `CO_CHANGED` link.

Sweeping changes that touch more than 12 files are skipped as too noisy to learn from. Weights stay
between 0 and 1, so no single run can dominate.

**Warm start.** `klew index` replays the repository's last 300 commits through this same rule, using
each commit message as the task and the files it modified as the outcome. A fresh install starts with a
graph that has already learned how your team's words map to your code.

## Why not a vector store?

- **The file you need often doesn't look like the task.** It's the caller, the test, or the config two hops
  away. Similarity can't follow a call edge.
- **It learns without re-embedding.** Outcomes update edge weights in place.
- **It explains itself.** A path through the code can be audited; a cosine score can't.
- **It spends fewer tokens.** Signatures and one good snippet instead of whole 40-line chunks.

Vector search is good at fuzzy matching, so Klew can use it as one more seed source (the
"Klew + vector seeds" approach in [Evaluation](#docs/evaluation)). The graph then does the rest.
