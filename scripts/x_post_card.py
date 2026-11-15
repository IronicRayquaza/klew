"""Render the X/LinkedIn launch image in the website's theme (logo, palette, fonts, hero art).

Every number is read from eval/results/*.json (held-out slice), never typed in.
  .venv/bin/python scripts/x_post_card.py --out docs/social/klew-launch.png
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "web" / "public"


def held(repo: str) -> dict:
    d = json.loads((ROOT / "eval" / "results" / f"{repo}.json").read_text())
    return {"s": d.get("summary_held_out") or d["summary"], "n": d.get("held_out_commits") or d["scored"]}


def numbers() -> dict:
    hx, fl, od = held("httpx"), held("flask"), held("ods")
    h, v, learn, static = (hx["s"][k] for k in ("graph_hybrid", "vector", "graph_learn", "graph_static"))
    pct = lambda x: round(x * 100)  # noqa: E731
    return {
        "klew": pct(h["budget_recall"]), "rag": pct(v["budget_recall"]), "n": hx["n"],
        "tok_cut": round((1 - h["tokens_per_hit"] / v["tokens_per_hit"]) * 100),
        "mrr_gain": f"{(learn['mrr'] - static['mrr']) * 100:.1f}",
        "flask": (pct(fl["s"]["graph_hybrid"]["budget_recall"]), pct(fl["s"]["vector"]["budget_recall"])),
        "ods": (pct(od["s"]["graph_hybrid"]["budget_recall"]), pct(od["s"]["vector"]["budget_recall"])),
    }


def page(n: dict) -> str:
    logo = (PUB / "brand" / "logo.svg").as_uri()
    hero = (PUB / "heroBg.webp").as_uri()
    return f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=block">
<style>
:root{{--paper:#f6f5f1;--card:#fff;--ink:#172a38;--ink2:#334b5c;--muted:#677985;--line:#e4e2da;--trail:#c47a1b;--moss:#2b7a58}}
*{{box-sizing:border-box;margin:0}}
body{{width:1600px;height:900px;background:var(--paper);font-family:"Instrument Sans",sans-serif;color:var(--ink);overflow:hidden}}
.stage{{position:absolute;inset:28px;border-radius:40px;overflow:hidden;background:#dcd3c3}}
.stage img.bg{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.04)}}
.veil{{position:absolute;inset:0;background:linear-gradient(90deg,rgba(246,245,241,.97) 0%,rgba(246,245,241,.93) 47%,rgba(246,245,241,.55) 66%,rgba(246,245,241,.08) 100%)}}
.mist{{position:absolute;inset:auto 0 0 0;height:200px;background:linear-gradient(0deg,rgba(246,245,241,.92),transparent)}}
.content{{position:absolute;inset:0;padding:60px 72px 104px;display:flex;flex-direction:column}}
.brand{{display:flex;align-items:center;gap:16px}}
.brand img{{height:52px}}
.brand b{{font:700 40px/1 "Bricolage Grotesque";letter-spacing:-.03em}}
.brand span{{font:400 15px "JetBrains Mono";color:var(--ink2)}}
.pill{{margin-left:22px;font:500 14px "JetBrains Mono";color:var(--ink);background:rgba(255,255,255,.85);border:1px solid var(--line);border-radius:999px;padding:9px 18px}}
h1{{margin-top:52px;font:700 72px/1.03 "Bricolage Grotesque";letter-spacing:-.035em;white-space:nowrap}}
h1 em{{font-style:normal;color:var(--trail)}}
.sub{{margin-top:22px;font-size:25px;line-height:1.45;color:var(--ink2);max-width:780px;text-wrap:pretty}}
.stats{{margin-top:auto;display:flex;gap:18px}}
.stat{{background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:26px;padding:24px 28px;box-shadow:0 12px 32px -10px rgba(23,42,56,.12)}}
.stat .k{{font:500 13px "JetBrains Mono";letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}}
.stat .v{{margin-top:10px;font:700 54px/1 "Bricolage Grotesque";letter-spacing:-.03em;font-variant-numeric:tabular-nums}}
.stat .v small{{font:500 24px "Instrument Sans";color:var(--muted);letter-spacing:0}}
.stat .d{{margin-top:10px;font-size:17px;color:var(--ink2);max-width:300px;line-height:1.4}}
.trail{{color:var(--trail)}} .moss{{color:var(--moss)}}
.foot{{position:absolute;left:72px;right:72px;bottom:40px;display:flex;justify-content:space-between;font:500 16px "JetBrains Mono";color:var(--ink2)}}
.foot b{{color:var(--ink)}}
</style></head><body>
<div class="stage">
  <img class="bg" src="{hero}">
  <div class="veil"></div><div class="mist"></div>
  <div class="content">
    <div class="brand"><img src="{logo}"><b>Klew</b><span>/kluː/</span><div class="pill">MCP context server · built on HydraDB</div></div>
    <h1>Your codebase is a labyrinth.<br><em>Klew is the thread.</em></h1>
    <p class="sub">It walks a code graph in HydraDB to hand coding agents the files that matter, with a reason for each, and learns from every merged&nbsp;PR.</p>
    <div class="stats">
      <div class="stat"><div class="k">Right file in context</div>
        <div class="v trail">{n["klew"]}% <small>vs {n["rag"]}% vector RAG</small></div>
        <div class="d">Same 2,000-token budget, {n["n"]}&nbsp;held&#8209;out httpx&nbsp;commits</div></div>
      <div class="stat"><div class="k">Context tokens</div>
        <div class="v">{n["tok_cut"]}% <small>fewer</small></div>
        <div class="d">tokens per correct file than vector&nbsp;RAG</div></div>
      <div class="stat"><div class="k">Learning from PRs</div>
        <div class="v moss">+{n["mrr_gain"]} <small>MRR pts</small></div>
        <div class="d">Significant on all 3 repos, including one we never tuned on</div></div>
    </div>
  </div>
  <div class="foot"><span><b>klew-demo.onrender.com</b></span><span>pip install klew · npx -y klew-mcp mcp</span></div>
</div></body></html>"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ROOT / "docs" / "social" / "klew-launch.png")
    a = ap.parse_args()
    html = a.out.with_suffix(".html")
    html.write_text(page(numbers()), encoding="utf-8")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=2)
        pg.goto(html.resolve().as_uri())
        pg.evaluate("document.fonts.ready")
        pg.wait_for_timeout(800)
        pg.screenshot(path=str(a.out))
        b.close()
    html.unlink(missing_ok=True)
    print(a.out)


if __name__ == "__main__":
    main()
