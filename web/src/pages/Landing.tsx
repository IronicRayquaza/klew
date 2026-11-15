import { useEffect, useRef, useState } from "react";
import { Curve } from "../components/Curve";
import { IconArrowRight, IconCheck, IconCopy } from "../components/Icons";
import { LabyrinthHero } from "../components/LabyrinthHero";
import { useEvalResults } from "../useEval";

interface Props {
  onTry: () => void;
  onResults: () => void;
  onDocs: (slug?: string) => void;
}

const MYTH_CARDS = [
  {
    index: "01",
    eyebrow: "The Labyrinth",
    mythFrom: "Myth: The Maze",
    klewTo: "Klew: Codebase Graph",
    title: "A large codebase where word overlap gets lost",
    body: "The file you need to edit often doesn't share words with the issue title. Vector search ranks isolated chunks by similarity; it can't follow a call, find the test, or know which files always change together.",
    image: "/card1.webp",
  },
  {
    index: "02",
    eyebrow: "Ariadne's Clew (/kluː/)",
    mythFrom: "Myth: The Thread",
    klewTo: "Klew: Why-Path Walk",
    title: "The thread that unwinds into an auditable clue",
    body: "Ariadne gave Theseus a clew of thread to trace his way through the maze - the direct root of the word 'clue'. Klew walks calls, imports, and tests in HydraDB, returning a token-budgeted pack with a why-path for every file.",
    image: "/card2.webp",
  },
  {
    index: "03",
    eyebrow: "The Desire Path",
    mythFrom: "Myth: Worn Trail",
    klewTo: "Klew: Continual Learning",
    title: "Paths that get stronger with every merged\u00a0PR",
    body: "After an agent run or merged PR, record_outcome reinforces the paths that led to the files that actually changed and gently decays served misses. Structural facts stay untouched, so re-indexing never erases experience.",
    image: "/card3.webp",
  },
] as const;

export function Landing({ onTry, onResults, onDocs }: Props) {
  const { results } = useEvalResults();
  const [selectedRepoKey, setSelectedRepoKey] = useState<"httpx" | "flask" | "ods">("httpx");
  const [installTab, setInstallTab] = useState<"cli" | "mcp" | "action">("cli");
  const [copied, setCopied] = useState(false);

  // Hero background: one requestAnimationFrame loop eases scroll expansion and mouse parallax toward their
  // targets and writes only compositor-friendly properties (clip-path, transform). No layout per scroll event,
  // no CSS transition fighting the updates, and the loop stops once everything has settled.
  const imgFrameRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const mistRef = useRef<HTMLDivElement>(null);
  const target = useRef({ expand: 0, parallax: 0, mx: 0, my: 0 });
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    const EXPAND_DISTANCE = 180; // first 180px of scroll expands the image while the hero text stays put
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cur = { expand: 0, parallax: 0, mx: 0, my: 0 };
    let raf = 0;

    const readScroll = () => {
      const y = window.scrollY || 0;
      target.current.expand = Math.min(1, Math.max(0, y / EXPAND_DISTANCE));
      target.current.parallax = Math.min(48, Math.max(0, y - EXPAND_DISTANCE) * 0.08);
    };

    const paint = () => {
      const vw = window.innerWidth / 100;
      const vh = window.innerHeight / 100;
      const open = 1 - cur.expand;
      const t = open * 1.2 * vh;
      const x = open * 5 * vw;
      const b = open * 6.5 * vh;
      const r = open * 32;
      if (imgFrameRef.current) {
        imgFrameRef.current.style.clipPath = `inset(${t.toFixed(2)}px ${x.toFixed(2)}px ${b.toFixed(2)}px ${x.toFixed(2)}px round ${r.toFixed(2)}px)`;
      }
      if (mistRef.current) mistRef.current.style.transform = `translate3d(0, ${(-b).toFixed(2)}px, 0)`;
      if (imgElRef.current) {
        const mx = cur.mx * -20;
        const my = cur.my * -12 - cur.parallax;
        imgElRef.current.style.transform = `translate3d(${mx.toFixed(2)}px, ${my.toFixed(2)}px, 0) scale(1.08)`;
      }
    };

    const tick = () => {
      const k = reduce ? 1 : 0.14; // easing per frame; 1 = snap (reduced motion)
      let moving = false;
      for (const key of ["expand", "parallax", "mx", "my"] as const) {
        const d = target.current[key] - cur[key];
        if (Math.abs(d) > 0.0005) {
          cur[key] += d * k;
          moving = true;
        } else {
          cur[key] = target.current[key];
        }
      }
      paint();
      raf = moving ? requestAnimationFrame(tick) : 0;
    };

    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    kickRef.current = reduce ? () => {} : kick;

    const onScroll = () => {
      readScroll();
      kick();
    };
    readScroll();
    Object.assign(cur, target.current);
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    target.current.mx = Math.max(-1, Math.min(1, nx));
    target.current.my = Math.max(-1, Math.min(1, ny));
    kickRef.current();
  };

  const handleHeroMouseLeave = () => {
    target.current.mx = 0;
    target.current.my = 0;
    kickRef.current();
  };

  const activeEval =
    results?.find((r) => r.repo.toLowerCase().includes(selectedRepoKey)) ??
    results?.find((r) => r.repo.includes("httpx")) ??
    results?.[0];

  const s = activeEval?.summary_held_out ?? activeEval?.summary;
  // Every number comes from eval/results (held-out slice); show a dash until it loads.
  const nCommits = activeEval?.held_out_commits ?? activeEval?.scored;
  const pctOf = (v?: number) => (v == null ? "–" : `${Math.round(v * 100)}`);
  const tok = (v?: number | null) => (v == null ? "–" : Math.round(v).toLocaleString());

  const hybridCtx = pctOf(s?.graph_hybrid?.budget_recall);
  const klewCtx = pctOf(s?.graph_learn?.budget_recall);
  const vecCtx = pctOf(s?.vector?.budget_recall);

  const tokRatio =
    s?.vector?.tokens_per_hit && s?.graph_learn?.tokens_per_hit
      ? (s.vector.tokens_per_hit / s.graph_learn.tokens_per_hit).toFixed(1)
      : "–";

  // MRR: the learning gain that is significant on every repo (see ci_held_out).
  const learnLift =
    s?.graph_learn && s?.graph_static ? ((s.graph_learn.mrr - s.graph_static.mrr) * 100).toFixed(1) : "–";

  const copyInstall = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const cliSnippet = `pip install klew
klew hydra up              # starts self-hosted HydraDB in Docker
klew index .               # maps repo + learns from last 300 commits
klew context "Raise ReadTimeout when stream times out"`;

  const mcpSnippet = `{
  "mcpServers": {
    "klew": {
      "command": "npx",
      "args": ["-y", "klew", "mcp"]
    }
  }
}`;

  const actionSnippet = `- name: Teach Klew on PR merge
  uses: IronicRayquaza/klew/action@main
  with:
    hydra-uri: \${{ secrets.HYDRA_URI }}
    hydra-token: \${{ secrets.HYDRA_TOKEN }}`;

  const activeSnippet =
    installTab === "cli" ? cliSnippet : installTab === "mcp" ? mcpSnippet : actionSnippet;

  return (
    <div className="w-full">
      {/* =====================================================================
          HERO STAGE - STICKY PARALLAX EXPANDING IMAGE (90% -> 100%) + GRAPH
         ===================================================================== */}
      <section
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
        className="relative w-full"
      >
        {/* Layer A: Sticky Full-Screen Background Layer (pinned until LabyrinthHero finishes) */}
        <div className="pointer-events-none sticky top-0 z-0 h-screen w-full overflow-hidden">
          <div
            ref={imgFrameRef}
            style={{ clipPath: "inset(1.2vh 5vw 6.5vh 5vw round 32px)" }}
            className="absolute inset-0 overflow-hidden"
          >
            {/* Background Image with Mouse Hover Movement + Scroll Parallax */}
            <img
              ref={imgElRef}
              src="/heroBg.webp"
              alt=""
              aria-hidden="true"
              style={{ transform: "translate3d(0px, 0px, 0) scale(1.08)" }}
              className="h-full w-full object-cover object-center select-none will-change-transform"
            />

            {/* Soft Atmospheric Veil for Crisp Headline Readability */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 64% 56% at 50% 44%, rgba(246, 245, 241, 0.86) 0%, rgba(246, 245, 241, 0.48) 58%, rgba(246, 245, 241, 0.10) 100%)",
              }}
            />

            {/* Bottom Mist Blend into Page Background */}
            <div
              ref={mistRef}
              className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-paper via-paper/55 to-transparent will-change-transform"
            />
          </div>
        </div>

        {/* Layer B: Foreground Content (Hero Sticky Runway + Labyrinth Graph) */}
        <div className="relative z-10 -mt-[100vh]">
          {/* 180px Sticky Runway: H1 & hero content stay 100% motionless via native CSS sticky while image expands */}
          <div className="relative h-[calc(100vh+180px)] w-full">
            <div className="sticky top-0 flex h-screen w-full flex-col items-center justify-center px-frame pt-14 text-center">
              <div className="mx-auto max-w-4xl">
                <div className="inline-flex items-center rounded-full border border-line bg-card/90 px-4 py-1.5 font-mono text-xs text-ink shadow-2xs backdrop-blur-md">
                  <span>MCP Context Server for Coding Agents · Built on HydraDB</span>
                </div>

                <h1 className="mt-7 font-display text-[clamp(2.6rem,5.2vw,4.6rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-ink drop-shadow-2xs">
                  Your codebase is a labyrinth.{" "}
                  <span className="text-trail">Klew is the thread.</span>
                </h1>

                <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft sm:text-xl">
                  Klew maps your repository into a code graph in HydraDB, walks bounded structural paths
                  from a task, and returns a token-budgeted context pack with a{" "}
                  <strong className="font-semibold text-ink">why-path thread</strong> for every file -
                  learning which paths lead to merged code.
                </p>

                <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
                  <button
                    type="button"
                    onClick={onTry}
                    className="btn-soft inline-flex items-center gap-2.5 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-paper shadow-sm hover:bg-trail"
                  >
                    <span>Explore the Playground</span>
                    <IconArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={onResults}
                    className="btn-soft rounded-full border border-line bg-card/90 px-6 py-3.5 text-sm font-medium text-ink backdrop-blur-md hover:border-ink/40"
                  >
                    View Held-Out Evidence
                  </button>
                  <button
                    type="button"
                    onClick={() => onDocs("quickstart")}
                    className="btn-soft rounded-full bg-card/75 px-5 py-3.5 text-sm font-medium text-ink-soft backdrop-blur-md hover:text-ink"
                  >
                    Read Docs
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Thread Canvas (rises over the expanded fixed hero image after the 180px expansion runway) */}
          <div className="px-frame pt-6 pb-24 sm:pb-32">
            <LabyrinthHero />
          </div>
        </div>
      </section>

      {/* =====================================================================
          THE MYTH & ARCHITECTURE - EDITORIAL 3-CARD TRIPTYCH (4:3 ILLUSTRATIONS)
         ===================================================================== */}
      <section className="px-frame py-20 sm:py-28">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">
              Why the name is Klew
            </span>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Both the thread through the maze and the clue to the answer.
            </h2>
          </div>

          <p className="max-w-md text-sm leading-relaxed text-muted">
            Pronounced <span className="font-mono text-ink">/kluː/</span>. In Greek myth, Ariadne
            gave Theseus a <span className="font-medium text-ink">clew</span> of thread to navigate
            the Labyrinth - the direct origin of the word{" "}
            <span className="font-medium text-ink">clue</span>.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {MYTH_CARDS.map((card) => (
            <article
              key={card.index}
              className="group surface-card flex flex-col overflow-hidden p-3.5 transition-all duration-500 hover:-translate-y-1 sm:p-4"
            >
              {/* 4:3 Illustration Container */}
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-paper">
                <img
                  src={card.image}
                  alt={card.eyebrow}
                  className="h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                />
              </div>

              {/* Editorial Card Body */}
              <div className="flex flex-1 flex-col justify-between px-3 pt-6 pb-3 sm:px-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted">
                    <span className="font-medium text-ink">
                      {card.index} · {card.eyebrow}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span>{card.mythFrom}</span>
                      <IconArrowRight size={11} />
                      <span>{card.klewTo}</span>
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-xl font-semibold leading-snug tracking-tight text-balance text-ink sm:text-[22px]">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{card.body}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* =====================================================================
          EVIDENCE AT A GLANCE - SPACIOUS METRICS + FULL-WIDTH GRAPH
         ===================================================================== */}
      <section className="px-frame py-20 sm:py-28">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">
              Held-Out Git Replay
            </span>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Earning its place over a vector store.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Measured on {nCommits ?? "–"} held-out commits of {activeEval?.repo ?? "each repo"}, every
              approach under the same 2,000-token budget. Klew only learns from a commit after answering it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 self-start rounded-full border border-line bg-card p-1.5">
            {(
              [
                ["httpx", "encode/httpx"],
                ["flask", "pallets/flask"],
                ["ods", "Osmantic/ODS"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedRepoKey(key)}
                className={`btn-soft rounded-full px-4 py-1.5 font-mono text-xs font-medium ${
                  selectedRepoKey === key
                    ? "bg-ink text-paper shadow-xs"
                    : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 3 Spacious Metric Cards */}
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="surface-card p-8 sm:p-10">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">
              Right File in 2k Budget
            </div>
            <div className="num mt-4 font-display text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
              {hybridCtx}%
            </div>
            <div className="num mt-2 font-mono text-xs font-medium text-ink">
              Klew standalone: {klewCtx}% · Vector RAG: {vecCtx}%
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Two-stage ranking puts direct and learned evidence at the top and walks the graph to
              fill the rest of the pack.
            </p>
          </div>

          <div className="surface-card p-8 sm:p-10">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">
              Token Efficiency
            </div>
            <div className="num mt-4 font-display text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
              {tokRatio}x
            </div>
            <div className="num mt-2 font-mono text-xs font-medium text-ink">
              Klew {tok(s?.graph_learn?.tokens_per_hit)} vs vector RAG {tok(s?.vector?.tokens_per_hit)} tokens
              per correct file
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Packs function signatures and targeted snippets instead of fixed 40-line chunks.
            </p>
          </div>

          <div className="surface-card p-8 sm:p-10">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">
              Continual Learning Lift (MRR)
            </div>
            <div className="num mt-4 font-display text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
              +{learnLift} pts
            </div>
            <div className="num mt-2 inline-flex items-center gap-1.5 font-mono text-xs font-medium text-ink">
              <span>Same graph, learning off</span>
              <IconArrowRight size={12} />
              <span>on (vs {pctOf(s?.graph_static?.mrr)}% MRR)</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Every merged PR strengthens links from the task's words to the files that actually
              changed, so the right file moves up the ranking.
            </p>
          </div>
        </div>

        {/* Full-Width Trajectory Graph Card */}
        {activeEval && (
          <div className="surface-card mt-8 p-6 sm:p-10">
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink sm:text-2xl">
                  Right file in context over time ·{" "}
                  <span className="font-mono text-base text-muted">{activeEval.repo}</span>
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Trailing-50 commit accuracy across chronological git replay (click any legend pill to filter)
                </p>
              </div>
              <button
                type="button"
                onClick={onResults}
                className="btn-soft inline-flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 font-mono text-xs font-medium text-ink hover:border-ink/40"
              >
                <span>Explore full Evidence &amp; ablations</span>
                <IconArrowRight size={13} />
              </button>
            </div>

            <Curve result={activeEval} metric="budget_recall" height={540} />
          </div>
        )}
      </section>

      {/* =====================================================================
          START IN 60 SECONDS - SPLIT EDITORIAL PIPELINE & TERMINAL WINDOW
         ===================================================================== */}
      <section className="px-frame pt-12 pb-20">
        <div className="surface-card overflow-hidden p-8 sm:p-12 lg:p-14">
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Left Column: Editorial Heading + 3-Step Workflow */}
            <div className="lg:col-span-5">
              <span className="font-mono text-xs uppercase tracking-widest text-muted">
                60-Second Setup
              </span>
              <h2 className="mt-2.5 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Connect Klew to your agent or terminal.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Self-hosted on open-source HydraDB. Index a 60-file repository in about two seconds
                and serve deterministic why-paths over MCP or CLI.
              </p>

              {/* 3-Step Pipeline Pills */}
              <div className="mt-7 space-y-3">
                {[
                  {
                    step: "01",
                    title: "Start local HydraDB & index repo",
                    meta: "klew hydra up && klew index .",
                  },
                  {
                    step: "02",
                    title: "Unwind token-budgeted context pack",
                    meta: "get_context(task, budget=2000)",
                  },
                  {
                    step: "03",
                    title: "Reinforce paths when PR merges",
                    meta: "record_outcome(run_id, touched_files)",
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="flex items-start gap-3.5 rounded-2xl border border-line/80 bg-paper/65 px-4 py-3"
                  >
                    <span className="num mt-0.5 rounded-full bg-card px-2.5 py-0.5 font-mono text-[11px] font-semibold text-ink shadow-2xs">
                      {item.step}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-ink sm:text-sm">{item.title}</div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                        {item.meta}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Tactile Window Frame with Mode Switcher & Code Surface */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-line bg-paper p-2.5 sm:p-3">
                {/* Window Chrome Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2.5">
                  <div className="flex flex-wrap items-center gap-1 rounded-full bg-card/80 p-1 text-xs font-medium shadow-2xs">
                    {(
                      [
                        ["cli", "Terminal CLI"],
                        ["mcp", "Claude / Cursor MCP"],
                        ["action", "GitHub Action"],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setInstallTab(k)}
                        className={`btn-soft rounded-full px-3.5 py-1.5 text-xs ${
                          installTab === k
                            ? "bg-ink text-paper shadow-2xs"
                            : "text-muted hover:text-ink"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => copyInstall(activeSnippet)}
                    className="btn-soft inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 py-1.5 font-mono text-xs font-medium text-ink shadow-2xs hover:bg-paper"
                  >
                    {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                    <span>{copied ? "Copied" : "Copy snippet"}</span>
                  </button>
                </div>

                {/* Inner Code Card */}
                <div className="overflow-hidden rounded-2xl border border-line/80 bg-card p-5 sm:p-7">
                  <div className="mb-3 flex items-center justify-between border-b border-line/60 pb-2.5 font-mono text-[11px] text-muted">
                    <span>
                      {installTab === "cli"
                        ? "shell · quickstart"
                        : installTab === "mcp"
                          ? "claude_desktop_config.json"
                          : ".github/workflows/klew-learn.yml"}
                    </span>
                    <span>Python 3.11+ · Docker</span>
                  </div>

                  <pre className="overflow-x-auto font-mono text-xs leading-[1.85] text-ink sm:text-[13px]">
                    {activeSnippet}
                  </pre>

                  {/* Bottom Telemetry Footer inside Code Card */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper/75 px-3.5 py-2 font-mono text-[11px] text-muted">
                    <span>bolt://127.0.0.1:7687 · ~2 s index (60 files)</span>
                    <button
                      type="button"
                      onClick={() => onDocs("quickstart")}
                      className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline"
                    >
                      <span>Full setup guide</span>
                      <IconArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
