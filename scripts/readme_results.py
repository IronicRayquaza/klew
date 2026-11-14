"""Write the README results block from eval/results/*.json (between RESULTS markers)."""
from __future__ import annotations

import json
from pathlib import Path

LABEL = {"vector": "Vector RAG", "bm25": "BM25 RAG", "graph_static": "Graph, no learning",
         "graph_learn": "**Desirepath**", "graph_hybrid": "**Desirepath + vector seeds**"}


def block(results: list[dict]) -> str:
    out = ["## Results", ""]
    for r in results:
        s = r["summary"]
        out += [f"**{r['repo']}**: {r['scored']} real commits replayed in order, 2,000-token budget for every arm.", "",
                "| Arm | Right file in context | Tokens per correct file | Recall@5 | Recall@10 | Top-1 | p50 latency |",
                "|---|---|---|---|---|---|---|"]
        for a in r["arms"]:
            x = s[a]
            tph = f"{x['tokens_per_hit']:,.0f}" if x["tokens_per_hit"] else "–"
            out.append(f"| {LABEL.get(a, a)} | {x['budget_recall']:.1%} | {tph} | {x['recall@5']:.1%} | "
                       f"{x['recall@10']:.1%} | {x['hit@1']:.1%} | {x['p50_ms']:.0f} ms |")
        if "graph_learn" in s and "graph_static" in s:
            lift = s["graph_learn"]["budget_recall"] - s["graph_static"]["budget_recall"]
            out += ["", f"Learning alone (same graph, learning on vs off): **{lift * 100:+.1f} points** of right-file-in-context."]
        out += ["", f"![learning curve](docs/img/{r['repo']}-curve.png)", ""]
    return "\n".join(out)


def main() -> None:
    results = [json.loads(p.read_text()) for p in sorted(Path("eval/results").glob("*.json"))]
    readme = Path("README.md")
    s = readme.read_text()
    a, b = s.index("<!-- RESULTS:START -->"), s.index("<!-- RESULTS:END -->")
    s = s[: a + len("<!-- RESULTS:START -->")] + "\n" + block(results) + "\n" + s[b:]
    readme.write_text(s)
    print("README results updated from", len(results), "result file(s)")


if __name__ == "__main__":
    main()
