import { useState } from "react";

type ScenarioId = "cidr" | "timeout" | "redirect";

type NodeDef = {
  id: string;
  label: string;
  sub: string;
  kind: "seed" | "symbol" | "file" | "distractor";
  x: number;
  y: number;
  packedRank?: number;
};

type EdgeDef = {
  from: string;
  to: string;
  via: string;
  learnedWeight?: string;
  activeOnFirstWalk: boolean;
  activeAfterLearn: boolean;
  isDesirePath?: boolean;
  curveY?: number;
};

type Scenario = {
  id: ScenarioId;
  shortTitle: string;
  task: string;
  firstWalkTokens: string;
  learnedTokens: string;
  summary: string;
  nodes: NodeDef[];
  edges: EdgeDef[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "cidr",
    shortTitle: "NO_PROXY CIDR routing",
    task: "Support NO_PROXY environment variable with CIDR ranges",
    firstWalkTokens: "1,120 tok · 2 hops",
    learnedTokens: "640 tok · 1-hop desire path",
    summary:
      "Vector search stops at _client.py. Klew walks a 2-hop structural path through URLPattern into _utils.py, then reinforces a direct desire path after the PR merges.",
    nodes: [
      { id: "seed", label: "term: cidr", sub: "Task seed · 1.00", kind: "seed", x: 120, y: 205 },
      { id: "Noise1", label: "httpx/_mounts.py", sub: "Unedited · 0.18", kind: "distractor", x: 395, y: 78 },
      { id: "sym1", label: "_proxies_to_mounts", sub: "_client.py · 0.84", kind: "symbol", x: 395, y: 175 },
      { id: "sym2", label: "is_ipv4_hostname", sub: "_utils.py · 0.96", kind: "symbol", x: 395, y: 285 },
      { id: "file2", label: "httpx/_client.py", sub: "Packed #2 · 0.89", kind: "file", x: 705, y: 155, packedRank: 2 },
      { id: "file1", label: "httpx/_utils.py", sub: "Packed #1 · 1.00", kind: "file", x: 705, y: 285, packedRank: 1 },
      { id: "test1", label: "tests/test_utils.py", sub: "Companion · 0.88", kind: "file", x: 985, y: 285, packedRank: 3 },
    ],
    edges: [
      { from: "seed", to: "sym1", via: "seed match", activeOnFirstWalk: true, activeAfterLearn: true, curveY: -12 },
      { from: "sym1", to: "Noise1", via: "imports", activeOnFirstWalk: false, activeAfterLearn: false, curveY: -14 },
      { from: "sym1", to: "file2", via: "defined in", activeOnFirstWalk: true, activeAfterLearn: true, curveY: -8 },
      { from: "sym1", to: "sym2", via: "calls", activeOnFirstWalk: true, activeAfterLearn: false, curveY: 0 },
      {
        from: "seed",
        to: "sym2",
        via: "points to",
        learnedWeight: "×2.4",
        activeOnFirstWalk: false,
        activeAfterLearn: true,
        isDesirePath: true,
        curveY: 22,
      },
      { from: "sym2", to: "file1", via: "defined in", activeOnFirstWalk: true, activeAfterLearn: true, isDesirePath: true, curveY: 0 },
      { from: "file1", to: "test1", via: "changes with", activeOnFirstWalk: true, activeAfterLearn: true, isDesirePath: true, curveY: 0 },
    ],
  },
  {
    id: "timeout",
    shortTitle: "ReadTimeout streaming",
    task: "Raise ReadTimeout when the server stalls while streaming the response body",
    firstWalkTokens: "1,340 tok · 2 hops",
    learnedTokens: "780 tok · reinforced path",
    summary:
      "The prompt mentions ReadTimeout, which lives in _exceptions.py, while the actual fix is inside _transports/default.py where map_httpcore_exceptions wraps the stream.",
    nodes: [
      { id: "seed", label: "ReadTimeout", sub: "Symbol seed · 1.00", kind: "seed", x: 120, y: 205 },
      { id: "exc", label: "httpx/_exceptions.py", sub: "Exception def · 0.72", kind: "distractor", x: 395, y: 82 },
      { id: "map", label: "map_httpcore_exc", sub: "default.py · 0.94", kind: "symbol", x: 395, y: 195 },
      { id: "resp", label: "ResponseStream", sub: "default.py · 0.98", kind: "symbol", x: 395, y: 295 },
      { id: "models", label: "httpx/_models.py", sub: "Packed #2 · 0.85", kind: "file", x: 705, y: 155, packedRank: 2 },
      { id: "def", label: "_transports/default.py", sub: "Packed #1 · 1.00", kind: "file", x: 705, y: 285, packedRank: 1 },
      { id: "tmo", label: "tests/test_timeouts.py", sub: "Companion · 0.91", kind: "file", x: 985, y: 285, packedRank: 3 },
    ],
    edges: [
      { from: "seed", to: "exc", via: "defined in", activeOnFirstWalk: false, activeAfterLearn: false, curveY: -18 },
      { from: "seed", to: "map", via: "referenced by", activeOnFirstWalk: true, activeAfterLearn: true, curveY: -8 },
      { from: "map", to: "models", via: "imported by", activeOnFirstWalk: true, activeAfterLearn: true, curveY: -10 },
      { from: "map", to: "resp", via: "wraps", activeOnFirstWalk: true, activeAfterLearn: false, curveY: 0 },
      {
        from: "seed",
        to: "resp",
        via: "points to",
        learnedWeight: "×2.8",
        activeOnFirstWalk: false,
        activeAfterLearn: true,
        isDesirePath: true,
        curveY: 22,
      },
      { from: "resp", to: "def", via: "defined in", activeOnFirstWalk: true, activeAfterLearn: true, isDesirePath: true, curveY: 0 },
      { from: "def", to: "tmo", via: "tested in", activeOnFirstWalk: true, activeAfterLearn: true, isDesirePath: true, curveY: 0 },
    ],
  },
  {
    id: "redirect",
    shortTitle: "Client.send redirects",
    task: "Client.send should not follow redirects to another origin with auth headers",
    firstWalkTokens: "1,290 tok · 2 hops",
    learnedTokens: "710 tok · co-change shortcut",
    summary:
      "Starting from Client.send, Klew follows the call edge into _build_redirect_request and pulls in _auth.py and test_auth.py via co-change history.",
    nodes: [
      { id: "seed", label: "Client.send", sub: "Method seed · 1.00", kind: "seed", x: 120, y: 205 },
      { id: "cfg", label: "httpx/_config.py", sub: "Unedited · 0.22", kind: "distractor", x: 395, y: 82 },
      { id: "redir", label: "_redirect_headers", sub: "_client.py · 0.96", kind: "symbol", x: 395, y: 200 },
      { id: "cli", label: "httpx/_client.py", sub: "Packed #1 · 1.00", kind: "file", x: 705, y: 170, packedRank: 1 },
      { id: "auth", label: "httpx/_auth.py", sub: "Packed #2 · 0.91", kind: "file", x: 705, y: 285, packedRank: 2 },
      { id: "tauth", label: "tests/test_auth.py", sub: "Companion · 0.89", kind: "file", x: 985, y: 230, packedRank: 3 },
    ],
    edges: [
      { from: "seed", to: "cfg", via: "imports", activeOnFirstWalk: false, activeAfterLearn: false, curveY: -18 },
      { from: "seed", to: "redir", via: "calls", activeOnFirstWalk: true, activeAfterLearn: true, isDesirePath: true, curveY: 0 },
      { from: "redir", to: "cli", via: "defined in", activeOnFirstWalk: true, activeAfterLearn: true, isDesirePath: true, curveY: -10 },
      {
        from: "redir",
        to: "auth",
        via: "changes with",
        learnedWeight: "×2.1",
        activeOnFirstWalk: true,
        activeAfterLearn: true,
        isDesirePath: true,
        curveY: 14,
      },
      { from: "cli", to: "tauth", via: "tested in", activeOnFirstWalk: true, activeAfterLearn: true, isDesirePath: true, curveY: -8 },
      { from: "auth", to: "tauth", via: "tested in", activeOnFirstWalk: false, activeAfterLearn: true, isDesirePath: true, curveY: 10 },
    ],
  },
];

export function LabyrinthHero() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("cidr");
  const [learned, setLearned] = useState<boolean>(true);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const nodeMap = new Map(scenario.nodes.map((n) => [n.id, n]));

  const NW = 152;
  const NH = 44;

  return (
    <div className="surface-card overflow-hidden p-5 sm:p-8">
      {/* Top Bar: Scenario Pills + Learning State Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full bg-paper p-1">
          {SCENARIOS.map((s) => {
            const active = s.id === scenario.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setScenarioId(s.id)}
                className={`btn-soft rounded-full px-3.5 py-1.5 text-xs font-medium ${
                  active
                    ? "bg-card text-ink shadow-xs"
                    : "text-muted hover:text-ink"
                }`}
              >
                {s.shortTitle}
              </button>
            );
          })}
        </div>

        {/* Continual Learning Toggle */}
        <div
          className="inline-flex items-center rounded-full bg-paper p-1 text-xs"
          role="group"
          aria-label="Graph learning state"
        >
          <button
            type="button"
            onClick={() => setLearned(false)}
            className={`btn-soft rounded-full px-3.5 py-1.5 font-medium ${
              !learned ? "bg-card text-ink shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            1st walk (exploratory)
          </button>
          <button
            type="button"
            onClick={() => setLearned(true)}
            className={`btn-soft rounded-full px-3.5 py-1.5 font-medium ${
              learned ? "bg-ink text-paper shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            After PR merge (learned)
          </button>
        </div>
      </div>

      {/* Soft Rounded Canvas Area */}
      <div className="relative overflow-hidden rounded-2xl border border-line/80 bg-paper/65 bg-playground-dots px-3 py-4 sm:px-6 sm:py-5">
        {/* Subtle Stage Headers */}
        <div className="mb-2 hidden grid-cols-4 border-b border-line/60 pb-2.5 font-mono text-[10px] uppercase tracking-wider text-muted sm:grid">
          <span>01 · Task Seed</span>
          <span>02 · Symbol Hop</span>
          <span>03 · Packed Files</span>
          <span className="text-right">04 · Co-change / Test</span>
        </div>

        <svg
          viewBox="0 0 1100 340"
          className="h-auto w-full select-none"
          role="img"
          aria-label={`Klew graph traversal for task: ${scenario.task}`}
        >
          <defs>
            <marker id="arr-trail" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="var(--trail)" />
            </marker>
            <marker id="arr-moss" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="var(--moss)" />
            </marker>
            <marker id="arr-muted" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 2 L 8 5 L 0 8 z" fill="var(--ink-3)" opacity="0.45" />
            </marker>
          </defs>

          {/* Edges */}
          {scenario.edges.map((e, i) => {
            const s = nodeMap.get(e.from);
            const t = nodeMap.get(e.to);
            if (!s || !t) return null;

            const isActive = learned ? e.activeAfterLearn : e.activeOnFirstWalk;
            const isReinforced = learned && e.isDesirePath;

            // Connect from right edge of source to left edge of target (unless same column)
            const sameCol = Math.abs(s.x - t.x) < 30;
            const goingUp = t.y < s.y;
            const sx = sameCol ? s.x : s.x + NW / 2;
            const sy = sameCol ? (goingUp ? s.y - NH / 2 : s.y + NH / 2) : s.y;
            const tx = sameCol ? t.x : t.x - NW / 2;
            const ty = sameCol ? (goingUp ? t.y + NH / 2 : t.y - NH / 2) : t.y;

            const mx = (sx + tx) / 2;
            const my = (sy + ty) / 2 + (e.curveY ?? 0);
            const d = sameCol
              ? `M ${sx} ${sy} L ${tx} ${ty}`
              : `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`;

            const stroke = !isActive
              ? "var(--rule)"
              : isReinforced
                ? "var(--moss)"
                : "var(--trail)";
            const strokeW = !isActive ? 1.1 : isReinforced ? 2.2 : 1.75;
            const dash = !isActive ? "3 4" : learned ? undefined : "5 4";
            const marker = !isActive
              ? "url(#arr-muted)"
              : isReinforced
                ? "url(#arr-moss)"
                : "url(#arr-trail)";

            const labelText = `${e.via}${learned && e.learnedWeight ? ` ${e.learnedWeight}` : ""}`;
            const pillW = Math.max(58, labelText.length * 5.6 + 14);
            const pillH = 18;
            const lx = sameCol ? sx : mx;
            const ly = sameCol ? (sy + ty) / 2 : (sy + 2 * my + ty) / 4;

            return (
              <g key={`${e.from}-${e.to}-${i}`} opacity={isActive ? 1 : 0.42}>
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeW}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                  markerEnd={marker}
                  className={isActive && learned ? "thread-draw" : undefined}
                />
                {/* Compact Edge Pill */}
                <g transform={`translate(${lx - pillW / 2}, ${ly - pillH / 2})`}>
                  <rect
                    width={pillW}
                    height={pillH}
                    rx={9}
                    fill="var(--card)"
                    stroke={isReinforced ? "var(--moss)" : "var(--rule)"}
                    strokeWidth="0.9"
                  />
                  <text
                    x={pillW / 2}
                    y={pillH / 2 + 3}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontFamily="var(--font-mono)"
                    fill={isReinforced ? "var(--moss)" : "var(--ink-2)"}
                  >
                    {labelText}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Compact, Non-Overlapping Nodes (no dot circles inside) */}
          {scenario.nodes.map((n) => {
            const isFile = n.kind === "file";
            const isSeed = n.kind === "seed";
            const isDistractor = n.kind === "distractor";
            const isPrimaryTarget = n.packedRank === 1;

            const stroke = isDistractor
              ? "var(--rule)"
              : isFile
                ? "var(--moss)"
                : isSeed
                  ? "var(--trail)"
                  : "var(--rule)";

            return (
              <g
                key={n.id}
                transform={`translate(${n.x - NW / 2}, ${n.y - NH / 2})`}
                opacity={isDistractor ? 0.52 : 1}
              >
                {isPrimaryTarget && (
                  <rect
                    x={-3}
                    y={-3}
                    width={NW + 6}
                    height={NH + 6}
                    rx={15}
                    fill="none"
                    stroke="var(--moss)"
                    strokeOpacity="0.22"
                    strokeWidth="2.5"
                  />
                )}
                <rect
                  width={NW}
                  height={NH}
                  rx={12}
                  fill="var(--card)"
                  stroke={stroke}
                  strokeWidth={isPrimaryTarget || isSeed ? 1.6 : 1.1}
                />
                <text
                  x={12}
                  y={18}
                  fontSize="10.5"
                  fontWeight="600"
                  fontFamily="var(--font-mono)"
                  fill={isDistractor ? "var(--ink-3)" : "var(--ink)"}
                >
                  {n.label}
                </text>
                <text
                  x={12}
                  y={32}
                  fontSize="9"
                  fontFamily="var(--font-sans)"
                  fill="var(--ink-3)"
                >
                  {n.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom Summary & Clean Breadcrumb Thread */}
      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <p className="max-w-2xl text-xs leading-relaxed text-muted sm:text-sm">
          {scenario.summary}
        </p>

        <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
          <span className="rounded-full border border-line bg-paper px-3 py-1 text-ink-soft">
            {learned ? scenario.learnedTokens : scenario.firstWalkTokens}
          </span>
        </div>
      </div>
    </div>
  );
}
