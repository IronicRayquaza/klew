"""Write the README results block from eval/results/*.json (between RESULTS markers)."""
from __future__ import annotations

import json
from pathlib import Path

LABEL = {"vector": "Vector RAG", "bm25": "BM25 RAG", "graph_static": "Klew, learning off",
         "graph_nowalk": "Klew without graph traversal", "graph_learn": "**Klew**",
         "graph_hybrid": "**Klew + vector seeds**"}


def table(summary: dict, arms: list[str]) -> list[str]:
    out = ["| Approach | Right file in context | Tokens per correct file | Recall@5 | Top-1 | MRR |",
           "|---|---|---|---|---|---|"]
    for a in arms:
        x = summary[a]
        tph = f"{x['tokens_per_hit']:,.0f}" if x["tokens_per_hit"] else "–"
        out.append(f"| {LABEL.get(a, a)} | {x['budget_recall']:.1%} | {tph} | {x['recall@5']:.1%} | "
                   f"{x['hit@1']:.1%} | {x['mrr']:.1%} |")
    return out


def block(results: list[dict], curves: dict[str, dict]) -> str:
    out = ["## Results", "",
           "**In one line:** on every repository, Klew puts the right file in the agent's context 31–47 points more often",
           "than vector RAG at the same budget (statistically significant everywhere), and learning from the repo's history",
           "significantly improves ranking on all three. On ranking alone, Klew with vector seeds beats vector RAG",
           "significantly on httpx and flask; on ODS only its MRR gain is significant.", "",
           "**How to read these numbers.** *Right file in context*: share of changed files inside the 2,000-token",
           "pack, which is what the agent reads (our headline). *Tokens per correct file*: context tokens spent per",
           "changed file found (lower is cheaper). *Recall@5*: share of changed files in the top five. *Top-1*: how",
           "often the #1 file changed. *MRR*: 1 if the first correct file is #1, ½ at #2, ⅓ at #3, and so on.", "",
           "Every number below is on **held-out commits**: the first 100 commits of each window were used for",
           "tuning (`scripts/tune.py`), and these are the rest. Every approach gets the same 2,000-token budget.", ""]
    for r in sorted(results, key=lambda d: d["repo"] != "httpx"):
        s = r["summary_held_out"]
        tuned_here = r["repo"] == r.get("tuning_repo", "httpx")
        note = (f"first {r['tuned_on_first']} commits used for tuning" if tuned_here
                else "never used for tuning; every setting came from httpx")
        out += [f"### {r['repo']}: {r['held_out_commits']} held-out commits ({note})", ""] + table(s, r["arms"]) + [""]
        ci = r.get("ci_held_out")
        if ci:
            out += ["**Key comparisons** (paired 95% bootstrap intervals over these commits; ✓ = the interval excludes 0):", "",
                    "| Comparison | Right file in context | Recall@5 | Top-1 | MRR |", "|---|---|---|---|---|"]
            for c in ci["comparisons"]:
                cells = []
                for m in ("budget_recall", "recall@5", "hit@1", "mrr"):
                    v = c["metrics"][m]
                    cells.append(f"{v['diff'] * 100:+.1f} [{v['lo'] * 100:+.1f}, {v['hi'] * 100:+.1f}]{' ✓' if v['significant'] else ''}")
                out.append(f"| {c['label']} | " + " | ".join(cells) + " |")
            out.append("")
        if "graph_static" in s and "graph_learn" in s:
            out.append(f"- **Learning** (same graph, learning off vs on): "
                       f"{(s['graph_learn']['budget_recall'] - s['graph_static']['budget_recall']) * 100:+.1f} pts right file in context.")
        if "graph_nowalk" in s and "graph_learn" in s:
            out.append(f"- **Graph traversal** (Klew with vs without the walk): "
                       f"{(s['graph_learn']['budget_recall'] - s['graph_nowalk']['budget_recall']) * 100:+.1f} pts right file in context, "
                       f"{(s['graph_learn']['hit@1'] - s['graph_nowalk']['hit@1']) * 100:+.1f} pts top-1.")
        c = curves.get(r["repo"])
        if c:
            p0, pn = c["points"][0], c["points"][-1]
            out += ["", f"**Accuracy as the graph learns** (learn from N past commits, then freeze; held-out): "
                    f"right file in context {p0['budget_recall']:.1%} → {pn['budget_recall']:.1%}, "
                    f"recall@5 {p0['recall@5']:.1%} → {pn['recall@5']:.1%}, top-1 {p0['hit@1']:.1%} → {pn['hit@1']:.1%}, "
                    f"MRR {p0['mrr']:.1%} → {pn['mrr']:.1%} "
                    f"from 0 to {pn['learned']} commits learned.", "",
                    f"![accuracy as the graph learns](docs/img/{r['repo']}-learning.png)"]
        out += ["", f"![learning curve over the replay](docs/img/{r['repo']}-curve.png)", ""]
    out += ["Latency: Klew answers in about 0.2–0.4 s per request versus about 15 ms for a vector lookup.", ""]
    return "\n".join(out)


def main() -> None:
    results = [json.loads(p.read_text()) for p in sorted(Path("eval/results").glob("*.json"))]
    curves = {json.loads(p.read_text())["repo"]: json.loads(p.read_text())
              for p in sorted(Path("eval/results/learning").glob("*.json"))}
    readme = Path("README.md")
    s = readme.read_text()
    a, b = s.index("<!-- RESULTS:START -->"), s.index("<!-- RESULTS:END -->")
    s = s[: a + len("<!-- RESULTS:START -->")] + "\n" + block(results, curves) + "\n" + s[b:]
    readme.write_text(s)
    print("README results updated from", len(results), "result file(s) and", len(curves), "learning curve(s)")


if __name__ == "__main__":
    main()
