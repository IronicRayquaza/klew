# FAQ

**Does my code leave my machine?**
No. With the local setup, the graph lives in a HydraDB node on your machine, and snippets are read from
your working tree when a pack is built. The graph stores structure (names, signatures, line spans), not
file contents.

**Which languages are supported?**
Python today. The graph model and the learning are language-agnostic; adding a language means adding a
tree-sitter reader.

**What happens when the code changes?**
Re-run `klew index` (the GitHub Action does it on every merge). Structure is rebuilt from the code;
learned edges are kept.

**What if nothing matches the task?**
Klew abstains: it returns no items and says so. It would rather give the agent nothing than send it
somewhere wrong.

**Can a bad run poison the graph?**
Learning is bounded. Weights stay between 0 and 1, each outcome moves them by a fraction, links to files
that keep being served but not touched decay, and sweeping changes of more than 12 files are skipped.

**Does it replace vector search?**
It doesn't have to. On held-out commits Klew gets the changed file into the agent's context far more
often than vector RAG (72–95% vs 35–58% across three repositories), at about half the tokens per correct file,
a difference that is statistically significant on every repository. Ranking is closer: with vector results as
extra seeds, Klew ranks the right file higher than vector RAG with significance on httpx and flask (top-1 56.8%
vs 47.2% on httpx); on ODS only its MRR gain is significant. Without vector seeds, Klew's ranking is level with
vector RAG on httpx and ODS. So the strongest setup is both together. The cost is latency: about 0.2–0.4 s per request versus about 15 ms for a
vector lookup. See [Evaluation](#docs/evaluation).

**How fast is it?**
On httpx (60 files, 1,240 symbols), indexing takes about a second and a context pack takes about
about 0.2–0.3 s on a laptop, using 25 HydraDB queries that run in parallel within each hop. On a much larger
repository (ODS: 25,944 symbols, about 82,000 edges) it is about 0.9 s. Indexing ODS takes under a minute.

**Is it production-ready?**
It's a hackathon build with tests, CI and an evaluation harness. The local setup uses HydraDB's plaintext
development mode. Use TLS and a real token anywhere else.
