"""Render the X/Twitter card for Klew from eval/results (held-out numbers only). No logo.

Usage: .venv/bin/python scripts/social_card.py --out path/to/card.png [--repo httpx] [--theme light|dark]
"""
from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path


def numbers(repo: str) -> dict:
    d = json.loads(Path(f"eval/results/{repo}.json").read_text())
    s = d["summary_held_out"]
    k, v, off = s["graph_hybrid"], s["vector"], s["graph_static"]
    av = d["agent_view_held_out"]
    return {
        "repo": repo, "n": d["held_out_commits"], "budget": d["budget_tokens"],
        "klew": k["budget_recall"], "vec": v["budget_recall"],
        "k_tph": k["tokens_per_hit"], "v_tph": v["tokens_per_hit"],
        "k_none": av["arms"]["graph_hybrid"]["none_in_context"], "v_none": av["baseline_none_in_context"],
        "learn": s["graph_learn"]["budget_recall"] - off["budget_recall"],
    }


def labyrinth_svg(w: int, h: int, ink: str, dim: str, accent: str, bg: str, label: str) -> str:
    rnd = random.Random(7)
    cols, rows, gap = 13, 10, 44
    ox, oy = (w - (cols - 1) * gap) / 2, (h - (rows - 1) * gap) / 2
    pts = {(c, r): (ox + c * gap + rnd.uniform(-6, 6), oy + r * gap + rnd.uniform(-6, 6))
           for c in range(cols) for r in range(rows)}
    # The thread: a real why-path, task -> seed -> symbol -> file, drawn through the field.
    route = [(1, 8), (3, 6), (5, 6), (7, 4), (9, 3), (11, 1)]
    xy = [pts[p] for p in route]
    d = f"M {xy[0][0]:.1f} {xy[0][1]:.1f} "
    for (x0, y0), (x1, y1) in zip(xy, xy[1:], strict=False):
        mx = (x0 + x1) / 2
        d += f"C {mx:.1f} {y0:.1f}, {mx:.1f} {y1:.1f}, {x1:.1f} {y1:.1f} "
    # A real why-path from Klew's httpx graph (verified edge: _get_proxy_map CALLS get_environment_proxies).
    names = ["task", "", "BaseClient._get_proxy_map", "", "get_environment_proxies", "httpx/_utils.py"]
    rels = {4: "calls", 5: "defined in"}
    label_boxes = []   # (center x, y, width) of every text run, so background dots stay clear of it
    for i, (x, y) in enumerate(xy):
        if names[i]:
            lw = (len(names[i]) + len(rels.get(i, "")) + 2) * 9.2
            cx = x + lw / 2 if i == 0 else (x - 40 + lw / 2) if i == 2 else x - lw / 2 if i == len(xy) - 1 else x
            label_boxes.append((cx, y + (30 if i in (0, 2) else -18), lw))
    quote_w = len(label) * 7.4
    label_boxes.append((xy[0][0] + quote_w / 2, xy[0][1] + 50, quote_w))
    def clear(x, y):
        for (lx, ly, lw) in label_boxes:
            if abs(y - ly) < 22 and lx - lw / 2 - 16 < x < lx + lw / 2 + 16:
                return False
        return all(math.hypot(x - nx, y - ny) > 22 for nx, ny in xy)
    dots = []
    on = set(route)
    for p, (x, y) in pts.items():
        if p in on or not clear(x, y):
            continue
        r = 2.2 + rnd.random() * 1.6
        op = 0.18 + rnd.random() * 0.22
        dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{dim}" fill-opacity="{op:.2f}"/>')
    nodes = []
    for i, (x, y) in enumerate(xy):
        big = i in (0, len(xy) - 1)
        nodes.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{7 if big else 5}" fill="{accent if i else ink}"/>')
        if names[i]:
            anchor = "start" if i in (0, 2) else "end" if i == len(xy) - 1 else "middle"
            if i == 2:
                x = x - 40   # start just left of the node, clear of the rising thread
            dy = 30 if i in (0, 2) else -18   # the _get_proxy_map label sits below its node, clear of the thread
            rel = f'<tspan class="rel">{rels[i]}  </tspan>' if i in rels else ""
            nodes.append(f'<text x="{x:.1f}" y="{y + dy:.1f}" text-anchor="{anchor}" class="lbl" '
                         f'stroke="{bg}" stroke-width="7" paint-order="stroke" stroke-linejoin="round">{rel}{names[i]}</text>')
    return f'''<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">
  {''.join(dots)}
  <path d="{d}" fill="none" stroke="{accent}" stroke-width="3" stroke-linecap="round" opacity="0.95"/>
  {''.join(nodes)}
  <text x="{xy[0][0]:.1f}" y="{xy[0][1] + 54:.1f}" class="lbl dim">"{label}"</text>
</svg>'''


def html(n: dict, theme: str) -> str:
    dark = theme == "dark"
    bg, ink, muted, line = ("#0b0d0c", "#f2f2ef", "#8f948f", "#262a27") if dark else ("#f6f5f1", "#141614", "#6d716c", "#e2e1dc")
    accent = "#e6a03c" if dark else "#b06c12"
    card = "rgba(255,255,255,0.05)" if dark else "rgba(255,255,255,0.72)"
    dim = "#c9ccc6" if dark else "#9aa09a"
    pct = lambda x: f"{x * 100:.0f}%"  # noqa: E731
    svg = labyrinth_svg(640, 520, ink, dim, accent, bg, "Support NO_PROXY environment variable with CIDR ranges")
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box;margin:0}}
body{{width:1600px;height:900px;background:{bg};color:{ink};
  font-family:-apple-system,"SF Pro Display","SF Pro Text",system-ui,"Helvetica Neue",sans-serif;
  -webkit-font-smoothing:antialiased;overflow:hidden}}
.wrap{{position:relative;height:100%;padding:84px 96px 72px;display:grid;grid-template-columns:minmax(0,1fr) 640px;gap:40px}}
.eyebrow{{font:600 15px/1 "SF Pro Text",system-ui;letter-spacing:.08em;text-transform:uppercase;color:{muted}}}
h1{{margin-top:24px;font-size:58px;line-height:1.04;letter-spacing:-0.028em;font-weight:700}}
h1 span{{color:{accent}}}
.hero{{margin-top:58px;display:flex;align-items:flex-end;gap:28px}}
.big{{font-size:176px;line-height:.82;font-weight:700;letter-spacing:-0.045em;color:{accent};font-variant-numeric:tabular-nums}}
.cap{{min-width:0;max-width:390px;font-size:22px;line-height:1.35;color:{ink};letter-spacing:-0.005em;padding-bottom:6px}}
.cap b{{font-weight:600}}
.vs{{margin-top:34px;display:grid;gap:10px;max-width:640px}}
.bar{{display:grid;grid-template-columns:150px 1fr 64px;align-items:center;gap:14px;font-size:17px;color:{muted}}}
.track{{height:10px;border-radius:5px;background:{line};overflow:hidden}}
.fill{{height:100%;border-radius:5px}}
.num{{text-align:right;font-variant-numeric:tabular-nums;color:{ink};font-weight:600}}
.stats{{position:absolute;left:96px;right:96px;bottom:92px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}}
.stat{{background:{card};border:1px solid {line};border-radius:18px;padding:20px 24px;
  box-shadow:0 1px 0 rgba(255,255,255,{0.04 if dark else 0.9}) inset, 0 18px 40px rgba(0,0,0,{0.35 if dark else 0.06})}}
.stat .v{{font-size:34px;font-weight:700;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}}
.stat .v em{{font-style:normal;color:{muted};font-weight:500;font-size:24px}}
.stat .k{{margin-top:6px;font-size:15.5px;line-height:1.35;color:{muted}}}
.foot{{position:absolute;left:96px;right:96px;bottom:40px;font-size:14px;color:{muted};letter-spacing:.005em}}
.lbl{{font:500 15px "SF Mono",ui-monospace,Menlo,monospace;fill:{ink}}}
.lbl.dim{{fill:{muted};font-family:-apple-system,system-ui;font-style:italic;font-size:14px}}
.rel{{font:500 14px -apple-system,system-ui;fill:{muted};font-style:italic}}
.art{{align-self:start;margin-top:20px}}
</style></head><body><div class="wrap">
<div>
  <div class="eyebrow">Klew · context for coding agents · built on HydraDB</div>
  <h1>Your codebase is a labyrinth.<br><span>Klew is the thread.</span></h1>
  <div class="hero">
    <div class="big">{pct(n["klew"])}</div>
    <div class="cap">of tasks, the file the agent had to change was <b>already in its context</b>. Same <span style="white-space:nowrap">{n["budget"]:,}-token</span> budget.</div>
  </div>
  <div class="vs">
    <div class="bar"><span>Klew</span><div class="track"><div class="fill" style="width:{n["klew"] * 100:.1f}%;background:{accent}"></div></div><span class="num">{n["klew"] * 100:.1f}%</span></div>
    <div class="bar"><span>Vector RAG</span><div class="track"><div class="fill" style="width:{n["vec"] * 100:.1f}%;background:{dim}"></div></div><span class="num">{n["vec"] * 100:.1f}%</span></div>
  </div>
</div>
<div class="art">{svg}</div>
<div class="stats">
  <div class="stat"><div class="v">{n["k_none"]} <em>vs {n["v_none"]}</em></div><div class="k">of {n["n"]} tasks left the agent with none of the right files</div></div>
  <div class="stat"><div class="v">{n["k_tph"] / 1000:.1f}k <em>vs {n["v_tph"] / 1000:.1f}k</em></div><div class="k">context tokens spent per correct file</div></div>
  <div class="stat"><div class="v">+{n["learn"] * 100:.1f} <em>pts</em></div><div class="k">from learning on the repo's own history, same graph</div></div>
</div>
<div class="foot">Measured on {n["n"]} held-out commits of encode/{n["repo"]} that were never used for tuning. Klew = graph walk in HydraDB + learned links + vector seeds.</div>
</div></body></html>'''


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--repo", default="httpx")
    ap.add_argument("--theme", default="light", choices=["light", "dark"])
    a = ap.parse_args()
    page = a.out.with_suffix(".html")
    page.write_text(html(numbers(a.repo), a.theme))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=2)
        pg.goto(page.resolve().as_uri())
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(a.out))
        b.close()
    print(a.out)


if __name__ == "__main__":
    main()
