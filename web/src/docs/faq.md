# FAQ

**Does my code leave my machine?**
No. With the local setup, the graph lives in a HydraDB node on your machine, and snippets are read from
your working tree when a pack is built. The graph stores structure (names, signatures, line spans), not
file contents.

**Which languages are supported?**
Python today. The graph model and the learning are language-agnostic; adding a language means adding a
tree-sitter reader.

**What happens when the code changes?**
Re-run `desirepath index` (the GitHub Action does it on every merge). Structure is rebuilt from the code;
learned edges are kept.

**What if nothing matches the task?**
Desirepath abstains: it returns no items and says so. It would rather give the agent nothing than send it
somewhere wrong.

**Can a bad run poison the graph?**
Learning is bounded. Weights stay between 0 and 1, each outcome moves them by a fraction, links to files
that keep being served but not touched decay, and sweeping changes of more than 12 files are skipped.

**Does it replace vector search?**
It doesn't have to. On its own, Desirepath beats vector RAG at getting the right files into a fixed budget.
With vector results as extra seeds, it beats vector RAG on every quality metric we measure, including which
file it ranks first. The cost is latency: about half a second per request versus about 15 ms for a vector lookup. See [Evaluation](#docs/evaluation).

**How fast is it?**
On httpx (60 files, 1,240 symbols), indexing takes about a second and a context pack takes about
about half a second (median 555 ms on a laptop) using 25 HydraDB queries. Making the walk faster is
next on our list.

**Is it production-ready?**
It's a hackathon build with tests, CI and an evaluation harness. The local setup uses HydraDB's plaintext
development mode. Use TLS and a real token anywhere else.
