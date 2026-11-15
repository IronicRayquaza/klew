import { useEffect, useState } from "react";
import { snapshot } from "../api";

/*
 * Landing hero: real recorded packs, not an illustration.
 * Data: web/public/snapshot/hero.json, written by scripts/hero_snapshot.py (one clean httpx graph,
 * warm-started on its history, each task answered with learned edges ignored vs used).
 */

type HeroItem = {
  rank: number;
  path: string;
  score: number;
  tokens: number;
  reason: string;
  symbols: string[];
  why: { node: string; via: string | null }[];
};
type HeroPack = { tokens: number; files: number; ms: number; items: HeroItem[] };
type HeroScenario = { task: string; off: HeroPack; on: HeroPack; vector_top: string[] };
type HeroData = {
  repo: string;
  head: string;
  learned_from_commits: number;
  budget_tokens: number;
  scenarios: HeroScenario[];
};

const SHORT: Record<string, string> = {
  "Support NO_PROXY environment variable with CIDR ranges": "NO_PROXY CIDR ranges",
  "Raise ReadTimeout when the server stalls while streaming the response body": "ReadTimeout on stream stall",
  "Client.send should not follow redirects to another origin with auth headers": "Client.send redirect auth",
};

type GNode = { id: string; label: string; sub: string; kind: "seed" | "symbol" | "file"; x: number; y: number; rank?: number };
type GEdge = { from: string; to: string; via: string; learned: boolean };

const COL = { seed: 150, symbol: 520, file: 900 };
const FILE_Y = [70, 170, 270];
const NW = 200;
const NH = 46;

function clip(s: string, n: number) {
  return s.length > n ? `…${s.slice(s.length - n + 1)}` : s;
}

/** Turn a pack's top files into a 3-column graph: evidence → symbol hop (if any) → packed file. */
function layout(pack: HeroPack): { nodes: GNode[]; edges: GEdge[] } {
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const seeds: string[] = [];
  const addSeed = (id: string, label: string, sub: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label, sub, kind: "seed", x: COL.seed, y: 0 });
      seeds.push(id);
    }
    return id;
  };
  pack.items.forEach((it, i) => {
    const fid = `f:${it.path}`;
    nodes.set(fid, {
      id: fid,
      label: clip(it.path, 26),
      sub: `#${it.rank} in the pack · ${it.tokens} tok`,
      kind: "file",
      x: COL.file,
      y: FILE_Y[i] ?? 270,
      rank: it.rank,
    });
    const parts = it.reason ? it.reason.split("; ") : [];
    let any = false;
    for (const p of parts) {
      const learned = p.match(/^learned: '(.+)' → this file$/);
      if (learned) {
        edges.push({ from: addSeed(`t:${learned[1]}`, `'${learned[1]}'`, "task word"), to: fid, via: "learned link", learned: true });
        any = true;
      } else if (p.startsWith("name match")) {
        edges.push({ from: addSeed("name", "file name", "matches task words"), to: fid, via: "name match", learned: false });
        any = true;
      } else if (p.startsWith("mentions")) {
        const m = p.replace(/^mentions\s*/, "").replace(/`/g, "");
        edges.push({ from: addSeed(`m:${m}`, m, "identifier in task"), to: fid, via: "mentions", learned: false });
        any = true;
      }
    }
    // Walked in: the first why-step is the symbol the walk reached, then the structural edge to the file.
    if (!any && it.why.length >= 2) {
      const sym = it.why[0].node;
      const sid = `s:${sym}`;
      const short = sym.split(".").slice(-2).join(".");
      nodes.set(sid, { id: sid, label: clip(short, 26), sub: "symbol (walked)", kind: "symbol", x: COL.symbol, y: FILE_Y[i] ?? 270 });
      edges.push({ from: addSeed("terms", "task words", "lexical seeds"), to: sid, via: "seed", learned: false });
      edges.push({ from: sid, to: fid, via: it.why[1].via ?? "edge", learned: false });
    } else if (!any) {
      edges.push({ from: addSeed("terms", "task words", "lexical seeds"), to: fid, via: "seed", learned: false });
    }
  });
  const gap = 300 / Math.max(seeds.length, 1);
  seeds.forEach((id, i) => {
    const n = nodes.get(id)!;
    n.y = 20 + gap * (i + 0.5);
  });
  return { nodes: [...nodes.values()], edges };
}

export function LabyrinthHero() {
  const [data, setData] = useState<HeroData | null>(null);
  const [idx, setIdx] = useState(0);
  const [learned, setLearned] = useState(true);

  useEffect(() => {
    snapshot<HeroData>("hero.json").then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <div className="surface-card flex h-72 items-center justify-center p-8 font-mono text-sm text-muted">
        Loading a recorded walk…
      </div>
    );
  }

  const sc = data.scenarios[idx] ?? data.scenarios[0];
  const pack = learned ? sc.on : sc.off;
  const { nodes, edges } = layout(pack);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="surface-card overflow-hidden p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full bg-paper p-1">
          {data.scenarios.map((s, i) => (
            <button
              key={s.task}
              type="button"
              onClick={() => setIdx(i)}
              className={`btn-soft rounded-full px-3.5 py-1.5 text-xs font-medium ${
                i === idx ? "bg-card text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
            >
              {SHORT[s.task] ?? s.task}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center rounded-full bg-paper p-1 text-xs" role="group" aria-label="Graph learning state">
          <button
            type="button"
            onClick={() => setLearned(false)}
            className={`btn-soft rounded-full px-3.5 py-1.5 font-medium ${
              !learned ? "bg-card text-ink shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            Learning off
          </button>
          <button
            type="button"
            onClick={() => setLearned(true)}
            className={`btn-soft rounded-full px-3.5 py-1.5 font-medium ${
              learned ? "bg-ink text-paper shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            After {data.learned_from_commits} past commits
          </button>
        </div>
      </div>

      <p className="pb-3 font-mono text-xs text-ink-soft">
        <span className="text-muted">task ›</span> {sc.task}
      </p>

      <div className="relative overflow-hidden rounded-2xl border border-line/80 bg-paper/65 bg-playground-dots px-3 py-4 sm:px-6 sm:py-5">
        <div className="mb-2 hidden grid-cols-3 border-b border-line/60 pb-2.5 font-mono text-[10px] uppercase tracking-wider text-muted sm:grid">
          <span>01 · Evidence from the task</span>
          <span className="text-center">02 · Symbol hop (walk)</span>
          <span className="text-right">03 · Top 3 packed files</span>
        </div>

        <svg viewBox="0 0 1100 340" className="h-auto w-full select-none" role="img" aria-label={`Klew's top files for: ${sc.task}`}>
          <defs>
            <marker id="arr-trail" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="var(--trail)" />
            </marker>
            <marker id="arr-moss" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="var(--moss)" />
            </marker>
          </defs>

          {edges.map((e, i) => {
            const s = nodeMap.get(e.from);
            const t = nodeMap.get(e.to);
            if (!s || !t) return null;
            const sx = s.x + NW / 2;
            const tx = t.x - NW / 2;
            const mx = (sx + tx) / 2;
            const d = `M ${sx} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${tx} ${t.y}`;
            const stroke = e.learned ? "var(--moss)" : "var(--trail)";
            const pillW = Math.max(56, e.via.length * 5.6 + 14);
            // Point on the cubic at t = 0.7 (x is linear-ish; y follows the S-curve).
            const tt = 0.7;
            const lx = (1 - tt) ** 3 * sx + 3 * (1 - tt) ** 2 * tt * mx + 3 * (1 - tt) * tt ** 2 * mx + tt ** 3 * tx;
            const ly = (1 - tt) ** 3 * s.y + 3 * (1 - tt) ** 2 * tt * s.y + 3 * (1 - tt) * tt ** 2 * t.y + tt ** 3 * t.y;
            return (
              <g key={`${e.from}-${e.to}-${i}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={e.learned ? 2.2 : 1.6}
                  strokeDasharray={e.learned ? undefined : "5 4"}
                  strokeLinecap="round"
                  markerEnd={e.learned ? "url(#arr-moss)" : "url(#arr-trail)"}
                  className={e.learned ? "thread-draw" : undefined}
                />
                <g transform={`translate(${lx - pillW / 2}, ${ly - 9})`}>
                  <rect width={pillW} height={18} rx={9} fill="var(--card)" stroke={e.learned ? "var(--moss)" : "var(--rule)"} strokeWidth="0.9" />
                  <text x={pillW / 2} y={12} textAnchor="middle" fontSize="8.5" fontFamily="var(--font-mono)" fill={e.learned ? "var(--moss)" : "var(--ink-2)"}>
                    {e.via}
                  </text>
                </g>
              </g>
            );
          })}

          {nodes.map((n) => {
            const top = n.rank === 1;
            const stroke = n.kind === "file" ? "var(--moss)" : n.kind === "seed" ? "var(--trail)" : "var(--rule)";
            return (
              <g key={n.id} transform={`translate(${n.x - NW / 2}, ${n.y - NH / 2})`}>
                {top && (
                  <rect x={-3} y={-3} width={NW + 6} height={NH + 6} rx={15} fill="none" stroke="var(--moss)" strokeOpacity="0.22" strokeWidth="2.5" />
                )}
                <rect width={NW} height={NH} rx={12} fill="var(--card)" stroke={stroke} strokeWidth={top || n.kind === "seed" ? 1.6 : 1.1} />
                <text x={12} y={19} fontSize="10.5" fontWeight="600" fontFamily="var(--font-mono)" fill="var(--ink)">
                  {n.label}
                </text>
                <text x={12} y={34} fontSize="9" fontFamily="var(--font-sans)" fill="var(--ink-3)">
                  {n.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <p className="max-w-2xl text-xs leading-relaxed text-muted sm:text-sm">
          Recorded on {data.repo} @ <span className="font-mono">{data.head.slice(0, 8)}</span>. Vector RAG's top 3 for the
          same task: <span className="font-mono text-ink">{sc.vector_top.join(", ")}</span>.{" "}
          {learned
            ? "Green links were learned from past commits; dashed ones come from names and structure."
            : "With learning off, files arrive only through names and the structural walk."}
        </p>
        <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
          <span className="rounded-full border border-line bg-paper px-3 py-1 text-ink-soft">
            {pack.tokens.toLocaleString()} / {data.budget_tokens.toLocaleString()} tok · {pack.files} files
          </span>
        </div>
      </div>
    </div>
  );
}
