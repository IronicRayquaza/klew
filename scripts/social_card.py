"""Render the X/Twitter card for Klew from eval/results (held-out numbers only) with the Klew logo mark & wordmark.

Usage: .venv/bin/python scripts/social_card.py --out path/to/card.png [--repo httpx] [--theme light|dark]
"""
from __future__ import annotations

import argparse
import json
import math
import random
import shutil
import subprocess
from pathlib import Path


def numbers(repo: str) -> dict:
    d = json.loads(Path(f"eval/results/{repo}.json").read_text(encoding="utf-8"))
    s = d["summary_held_out"]
    k, v, off = s["graph_hybrid"], s["vector"], s["graph_static"]
    av = d["agent_view_held_out"]
    return {
        "repo": repo,
        "n": d["held_out_commits"],
        "budget": d["budget_tokens"],
        "klew": k["budget_recall"],
        "vec": v["budget_recall"],
        "k_tph": k["tokens_per_hit"],
        "v_tph": v["tokens_per_hit"],
        "k_none": av["arms"]["graph_hybrid"]["none_in_context"],
        "v_none": av["baseline_none_in_context"],
        "learn": s["graph_learn"]["budget_recall"] - off["budget_recall"],
    }


def klew_logo_svg(dark: bool) -> str:
    tile_bg = "#15212a" if dark else "#18303f"
    tile_border = "#263642" if dark else "#2b485a"
    trail = "#e0a23b"
    moss = "#6fc29a"
    return f'''<svg width="42" height="42" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="30" height="30" rx="7" fill="{tile_bg}" stroke="{tile_border}" stroke-width="1"/>
  <g fill="#8fa3ae" opacity="0.42">
    <circle cx="16" cy="7.5" r="1.2"/><circle cx="16" cy="16" r="1.2"/><circle cx="23.5" cy="16" r="1.2"/><circle cx="16" cy="24.5" r="1.2"/>
  </g>
  <circle cx="8.5" cy="11.5" r="0.8" fill="{trail}" opacity="0.72"/>
  <circle cx="8.5" cy="13.4" r="0.85" fill="{trail}" opacity="0.95"/>
  <path d="M 8.5 16 L 8.5 24.5" stroke="{trail}" stroke-width="2.15" stroke-linecap="round"/>
  <path d="M 23.5 7.5 L 8.5 16 L 23.5 24.5" stroke="{trail}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="8.5" cy="7.5" r="2.25" fill="{tile_bg}" stroke="{trail}" stroke-width="1.25"/>
  <circle cx="8.5" cy="7.5" r="0.95" fill="{trail}"/>
  <circle cx="8.5" cy="16" r="1.85" fill="{tile_bg}" stroke="{trail}" stroke-width="1.5"/>
  <circle cx="8.5" cy="24.5" r="1.85" fill="{trail}"/>
  <circle cx="23.5" cy="7.5" r="1.85" fill="{trail}"/>
  <circle cx="23.5" cy="24.5" r="2.35" fill="{moss}"/>
</svg>'''


def labyrinth_svg(w: int, h: int, ink: str, dim: str, accent: str, moss: str, bg: str, label: str) -> str:
    rnd = random.Random(7)
    cols, rows, gap = 13, 10, 44
    ox, oy = (w - (cols - 1) * gap) / 2, (h - (rows - 1) * gap) / 2
    pts = {
        (c, r): (ox + c * gap + rnd.uniform(-6, 6), oy + r * gap + rnd.uniform(-6, 6))
        for c in range(cols)
        for r in range(rows)
    }
    route = [(1, 8), (3, 6), (5, 6), (7, 4), (9, 3), (11, 1)]
    xy = [pts[p] for p in route]
    d_exploratory = f"M {xy[0][0]:.1f} {xy[0][1]:.1f} C {(xy[0][0]+xy[1][0])/2:.1f} {xy[0][1]:.1f}, {(xy[0][0]+xy[1][0])/2:.1f} {xy[1][1]:.1f}, {xy[1][0]:.1f} {xy[1][1]:.1f}"
    d_solid = f"M {xy[1][0]:.1f} {xy[1][1]:.1f} "
    for (x0, y0), (x1, y1) in zip(xy[1:], xy[2:], strict=False):
        mx = (x0 + x1) / 2
        d_solid += f"C {mx:.1f} {y0:.1f}, {mx:.1f} {y1:.1f}, {x1:.1f} {y1:.1f} "
    names = ["task (clew)", "", "BaseClient._get_proxy_map", "", "get_environment_proxies", "httpx/_utils.py"]
    rels = {4: "calls", 5: "defined in"}
    label_boxes = []
    for i, (x, y) in enumerate(xy):
        if names[i]:
            lw = (len(names[i]) + len(rels.get(i, "")) + 2) * 9.2
            cx = x + lw / 2 if i == 0 else (x - 40 + lw / 2) if i == 2 else x - lw / 2 if i == len(xy) - 1 else x
            label_boxes.append((cx, y + (30 if i in (0, 2) else -18), lw))
    quote_w = len(label) * 7.4
    label_boxes.append((xy[0][0] + quote_w / 2, xy[0][1] + 50, quote_w))

    def clear(x: float, y: float) -> bool:
        for lx, ly, lw in label_boxes:
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
        is_first = i == 0
        is_last = i == len(xy) - 1
        if is_first:
            nodes.append(
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="none" stroke="{accent}" stroke-width="1.5" stroke-dasharray="3 2"/>'
            )
            nodes.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5.5" fill="{accent}"/>')
        elif is_last:
            nodes.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="none" stroke="{moss}" stroke-width="1.5"/>')
            nodes.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6.5" fill="{moss}"/>')
        else:
            nodes.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="{accent}"/>')
        if names[i]:
            anchor = "start" if i in (0, 2) else "end" if is_last else "middle"
            lx = x - 40 if i == 2 else x
            dy = 30 if i in (0, 2) else -18
            rel = f'<tspan class="rel">{rels[i]}  </tspan>' if i in rels else ""
            nodes.append(
                f'<text x="{lx:.1f}" y="{y + dy:.1f}" text-anchor="{anchor}" class="lbl" '
                f'stroke="{bg}" stroke-width="7" paint-order="stroke" stroke-linejoin="round">{rel}{names[i]}</text>'
            )
    return f'''<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">
  {''.join(dots)}
  <path d="{d_exploratory}" fill="none" stroke="{accent}" stroke-width="2.6" stroke-dasharray="5 5" stroke-linecap="round"/>
  <path d="{d_solid}" fill="none" stroke="{accent}" stroke-width="3.2" stroke-linecap="round" opacity="0.96"/>
  {''.join(nodes)}
  <text x="{xy[0][0]:.1f}" y="{xy[0][1] + 54:.1f}" class="lbl dim">"{label}"</text>
</svg>'''


def html(n: dict, theme: str) -> str:
    dark = theme == "dark"
    bg, ink, muted, line = (
        ("#0f171d", "#e2eaee", "#8fa3ae", "#23333f")
        if dark
        else ("#eef1f2", "#18303f", "#5a6d78", "#cfd8dc")
    )
    accent = "#e0a23b" if dark else "#b8741a"
    moss = "#6fc29a" if dark else "#2e7556"
    card = "#141f27" if dark else "#f8fafa"
    dim = "#8fa3ae" if dark else "#7a8d98"
    pct = lambda x: f"{x * 100:.0f}%"  # noqa: E731
    logo = klew_logo_svg(dark)
    svg = labyrinth_svg(640, 520, ink, dim, accent, moss, bg, "Support NO_PROXY environment variable with CIDR ranges")
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box;margin:0}}
body{{width:1600px;height:900px;background:{bg};color:{ink};
  font-family:"Instrument Sans",-apple-system,"SF Pro Display",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;overflow:hidden;border:1px solid {line}}}
.wrap{{position:relative;height:100%;padding:72px 88px 64px;display:grid;grid-template-columns:minmax(0,1fr) 640px;gap:40px}}
.brand{{display:flex;align-items:center;gap:16px}}
.brand-name{{font-size:28px;font-weight:700;letter-spacing:-0.03em;color:{ink}}}
.brand-tag{{font:500 13px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:{muted};border-left:1px solid {line};padding-left:14px}}
h1{{margin-top:26px;font-size:56px;line-height:1.04;letter-spacing:-0.03em;font-weight:700}}
h1 span{{color:{accent}}}
.hero{{margin-top:46px;display:flex;align-items:flex-end;gap:28px}}
.big{{font-size:168px;line-height:.82;font-weight:700;letter-spacing:-0.045em;color:{accent};font-variant-numeric:tabular-nums}}
.cap{{min-width:0;max-width:390px;font-size:21px;line-height:1.38;color:{ink};padding-bottom:6px}}
.cap b{{font-weight:600}}
.vs{{margin-top:32px;display:grid;gap:12px;max-width:620px;font-family:"JetBrains Mono",ui-monospace,monospace}}
.bar{{display:grid;grid-template-columns:150px 1fr 68px;align-items:center;gap:14px;font-size:15px;color:{muted}}}
.track{{height:10px;background:{line};overflow:hidden}}
.fill{{height:100%}}
.num{{text-align:right;font-variant-numeric:tabular-nums;color:{ink};font-weight:600}}
.stats{{position:absolute;left:88px;right:88px;bottom:86px;display:grid;grid-template-columns:repeat(3,1fr);border:1px solid {line};background:{card}}}
.stat{{padding:22px 26px;border-right:1px solid {line}}}
.stat:last-child{{border-right:0}}
.stat .idx{{font:500 11px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:{muted};margin-bottom:8px}}
.stat .v{{font-size:34px;font-weight:700;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}}
.stat .v em{{font-style:normal;color:{muted};font-weight:500;font-size:22px}}
.stat .k{{margin-top:6px;font-size:15px;line-height:1.35;color:{muted}}}
.foot{{position:absolute;left:88px;right:88px;bottom:34px;display:flex;justify-content:space-between;font:500 13px "JetBrains Mono",ui-monospace,monospace;color:{muted}}}
.lbl{{font:500 14.5px "JetBrains Mono",ui-monospace,Menlo,monospace;fill:{ink}}}
.lbl.dim{{fill:{muted};font-style:italic;font-size:13.5px}}
.rel{{font:500 13.5px "JetBrains Mono",ui-monospace,monospace;fill:{moss}}}
.art{{align-self:start;margin-top:8px;border:1px solid {line};background:{card}}}
</style></head><body><div class="wrap">
<div>
  <div class="brand">{logo}<span class="brand-name">klew</span><span class="brand-tag">MCP Context Server · Built on HydraDB</span></div>
  <h1>Your codebase is a labyrinth.<br><span>Klew is the thread.</span></h1>
  <div class="hero">
    <div class="big">{pct(n["klew"])}</div>
    <div class="cap">of tasks, the file the agent had to change was <b>already in its context pack</b>. Same <span style="white-space:nowrap">{n["budget"]:,}-token</span> budget.</div>
  </div>
  <div class="vs">
    <div class="bar"><span>Klew + seeds</span><div class="track"><div class="fill" style="width:{n["klew"] * 100:.1f}%;background:{accent}"></div></div><span class="num">{n["klew"] * 100:.1f}%</span></div>
    <div class="bar"><span>Vector RAG</span><div class="track"><div class="fill" style="width:{n["vec"] * 100:.1f}%;background:{dim}"></div></div><span class="num">{n["vec"] * 100:.1f}%</span></div>
  </div>
</div>
<div class="art">{svg}</div>
<div class="stats">
  <div class="stat"><div class="idx">01 / BLIND STARTS</div><div class="v">{n["k_none"]} <em>vs {n["v_none"]}</em></div><div class="k">of {n["n"]} held-out tasks left the agent with zero relevant files</div></div>
  <div class="stat"><div class="idx">02 / TOKEN EFFICIENCY</div><div class="v">{n["k_tph"] / 1000:.1f}k <em>vs {n["v_tph"] / 1000:.1f}k</em></div><div class="k">context tokens spent per correct file retrieved</div></div>
  <div class="stat"><div class="idx">03 / CONTINUAL LEARNING</div><div class="v" style="color:{moss}">+{n["learn"] * 100:.1f} <em>pts</em></div><div class="k">gained from learning on merged PR history, same graph</div></div>
</div>
<div class="foot"><span>Measured on {n["n"]} held-out commits of encode/{n["repo"]} (zero future leakage).</span><span>pip install klew · npx -y klew mcp</span></div>
</div></body></html>'''


def render_html_to_png(page: Path, out: Path, width: int = 1600, height: int = 900) -> None:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": width, "height": height}, device_scale_factor=2)
            pg.goto(page.resolve().as_uri())
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(out))
            b.close()
        return
    except Exception:
        pass

    # Fallback to local headless Chrome or Edge
    browsers = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("msedge"),
    ]
    exe = next((b for b in browsers if b and Path(b).exists()), None)
    if not exe:
        raise RuntimeError("Neither Playwright nor headless Chrome/Edge found to render card.")
    subprocess.run(
        [
            exe,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            f"--window-size={width},{height}",
            "--force-device-scale-factor=2",
            f"--screenshot={out.resolve()}",
            page.resolve().as_uri(),
        ],
        check=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--repo", default="httpx")
    ap.add_argument("--theme", default="light", choices=["light", "dark"])
    a = ap.parse_args()
    page = a.out.with_suffix(".html")
    page.write_text(html(numbers(a.repo), a.theme), encoding="utf-8")
    render_html_to_png(page, a.out, 1600, 900)
    page.unlink(missing_ok=True)
    print(a.out)


if __name__ == "__main__":
    main()
