import { useState } from "react";
import { Curve } from "../components/Curve";
import { LabyrinthHero } from "../components/LabyrinthHero";
import { useEvalResults } from "../useEval";

interface Props {
  onTry: () => void;
  onResults: () => void;
  onDocs: (slug?: string) => void;
}

const MYTH_CARDS = [
  {
    eyebrow: "01 · The Labyrinth",
    title: "A large codebase where word overlap gets lost",
    body: "In real repositories, the file you need to edit rarely shares words with the issue title. Vector search retrieves isolated chunks by cosine similarity and gets trapped at the entry doorway when the real fix lives two hops away.",
    diagram: "labyrinth",
  },
  {
    eyebrow: "02 · Ariadne's Clew (/kluː/)",
    title: "The thread that unwinds into an auditable clue",
    body: "Ariadne gave Theseus a clew of thread to trace his way through the maze - the direct root of the word 'clue'. Klew walks calls, imports, and tests in HydraDB, returning a token-budgeted pack with a why-path for every file.",
    diagram: "clew",
  },
  {
    eyebrow: "03 · The Desire Path",
    title: "Paths that grow stronger with every merged PR",
    body: "After an agent run or merged PR, record_outcome reinforces the paths that led to the files that actually changed and gently decays served misses. Structural facts stay untouched, so re-indexing never erases experience.",
    diagram: "desire",
  },
] as const;

export function Landing({ onTry, onResults, onDocs }: Props) {
  const { results } = useEvalResults();
  const [selectedRepoKey, setSelectedRepoKey] = useState<"httpx" | "flask" | "ods">("httpx");
  const [installTab, setInstallTab] = useState<"cli" | "mcp">("cli");
  const [copied, setCopied] = useState(false);

  const activeEval =
    results?.find((r) => r.repo.toLowerCase().includes(selectedRepoKey)) ??
    results?.find((r) => r.repo.includes("httpx")) ??
    results?.[0];

  const s = activeEval?.summary_held_out ?? activeEval?.summary;
  const nCommits = activeEval?.held_out_commits ?? activeEval?.scored ?? 199;

  const hybridCtx = s?.graph_hybrid ? Math.round(s.graph_hybrid.budget_recall * 100) : 95;
  const klewCtx = s?.graph_learn ? Math.round(s.graph_learn.budget_recall * 100) : 90;
  const vecCtx = s?.vector ? Math.round(s.vector.budget_recall * 100) : 58;

  const tokRatio =
    s?.vector?.tokens_per_hit && s?.graph_learn?.tokens_per_hit
      ? (s.vector.tokens_per_hit / s.graph_learn.tokens_per_hit).toFixed(1)
      : "1.7";

  const learnLift =
    s?.graph_learn && s?.graph_static
      ? Math.round((s.graph_learn.budget_recall - s.graph_static.budget_recall) * 100)
      : 6;

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
    "klew": { "command": "npx", "args": ["-y", "klew", "mcp"] }
  }
}`;

  return (
    <div className="w-full">
      {/* =====================================================================
          HERO - BREATHABLE, SOFT, CENTERED EDITORIAL + INTERACTIVE THREAD
         ===================================================================== */}
      <section className="px-frame pt-12 pb-24 sm:pt-18 sm:pb-32">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center rounded-full border border-line bg-card px-4 py-1.5 font-mono text-xs text-muted shadow-2xs">
            <span>MCP Context Server for Coding Agents · Built on HydraDB</span>
          </div>

          <h1 className="mt-7 font-display text-[clamp(2.6rem,5.2vw,4.6rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-ink">
            Your codebase is a labyrinth.{" "}
            <span className="text-trail">Klew is the thread.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
            Klew maps your repository into a code graph in HydraDB, walks bounded structural paths
            from a task, and returns a token-budgeted context pack with a{" "}
            <strong className="font-medium text-ink">why-path thread</strong> for every file -
            learning which paths lead to merged code.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
            <button
              type="button"
              onClick={onTry}
              className="btn-soft inline-flex items-center gap-2.5 rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-paper shadow-sm hover:bg-trail"
            >
              <span>Explore the Playground</span>
              <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              onClick={onResults}
              className="btn-soft rounded-full border border-line bg-card px-6 py-3.5 text-sm font-medium text-ink hover:border-ink/40"
            >
              View Held-Out Evidence
            </button>
            <button
              type="button"
              onClick={() => onDocs("quickstart")}
              className="btn-soft rounded-full px-5 py-3.5 text-sm font-medium text-muted hover:text-ink"
            >
              Read Docs
            </button>
          </div>
        </div>

        {/* Interactive Thread Canvas */}
        <div className="mt-14 sm:mt-18">
          <LabyrinthHero />
        </div>
      </section>

      {/* =====================================================================
          THE MYTH & ARCHITECTURE - THREE BREATHABLE STORY CARDS
         ===================================================================== */}
      <section className="px-frame py-20 sm:py-28">
        <div className="max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            Why the name is Klew
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Both the thread through the maze and the clue to the answer.
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-7 lg:grid-cols-3">
          {MYTH_CARDS.map((card) => (
            <div
              key={card.eyebrow}
              className="surface-card flex flex-col justify-between p-8 sm:p-10"
            >
              <div>
                <div className="font-mono text-xs text-muted">{card.eyebrow}</div>
                <h3 className="mt-3 font-display text-xl font-semibold leading-snug text-ink">
                  {card.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{card.body}</p>
              </div>

              <div className="mt-8 flex h-36 items-center justify-center rounded-2xl bg-paper p-4">
                <MinimalMythGraphic kind={card.diagram} />
              </div>
            </div>
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
              Measured across {nCommits} held-out commits on real Python repositories under the
              exact same 2,000-token budget, with zero future leakage.
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
              {tokRatio}×
            </div>
            <div className="num mt-2 font-mono text-xs font-medium text-ink">
              {s?.graph_learn?.tokens_per_hit?.toLocaleString() ?? "2,175"} vs{" "}
              {s?.vector?.tokens_per_hit?.toLocaleString() ?? "3,742"} tokens per hit
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Packs concise function signatures and targeted snippets instead of bloated 80-line
              vector chunks.
            </p>
          </div>

          <div className="surface-card p-8 sm:p-10">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">
              Continual Learning Lift
            </div>
            <div className="num mt-4 font-display text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
              +{learnLift} pts
            </div>
            <div className="num mt-2 font-mono text-xs font-medium text-ink">
              Same graph, learning off → learning on
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Every merged PR strengthens links between issue vocabulary and the symbols that
              actually changed.
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
                className="btn-soft rounded-full border border-line bg-paper px-4 py-2 font-mono text-xs font-medium text-ink hover:border-ink/40"
              >
                Explore full Evidence &amp; ablations →
              </button>
            </div>

            <Curve result={activeEval} metric="budget_recall" height={540} />
          </div>
        )}
      </section>

      {/* =====================================================================
          START IN 60 SECONDS - MINIMAL TABBED QUICKSTART
         ===================================================================== */}
      <section className="px-frame pt-12 pb-20">
        <div className="surface-card mx-auto max-w-4xl p-8 sm:p-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-trail">
                60-Second Setup
              </span>
              <h2 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
                Connect Klew to your agent or terminal.
              </h2>
            </div>

            <div className="flex rounded-full bg-paper p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setInstallTab("cli")}
                className={`btn-soft rounded-full px-4 py-1.5 ${
                  installTab === "cli" ? "bg-card text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                Terminal CLI
              </button>
              <button
                type="button"
                onClick={() => setInstallTab("mcp")}
                className={`btn-soft rounded-full px-4 py-1.5 ${
                  installTab === "mcp" ? "bg-card text-ink shadow-xs" : "text-muted hover:text-ink"
                }`}
              >
                Claude / Cursor MCP
              </button>
            </div>
          </div>

          <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-paper p-5 sm:p-6">
            <button
              type="button"
              onClick={() => copyInstall(installTab === "cli" ? cliSnippet : mcpSnippet)}
              className="btn-soft absolute top-4 right-4 rounded-full border border-line bg-card px-3.5 py-1 font-mono text-xs text-ink shadow-2xs hover:border-trail"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <pre className="overflow-x-auto pr-20 font-mono text-xs leading-relaxed text-ink sm:text-sm">
              {installTab === "cli" ? cliSnippet : mcpSnippet}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}

function MinimalMythGraphic({ kind }: { kind: "labyrinth" | "clew" | "desire" }) {
  if (kind === "labyrinth") {
    return (
      <svg viewBox="0 0 280 100" className="h-full w-full" fill="none" aria-hidden="true">
        <circle cx="70" cy="50" r="34" stroke="var(--guide)" strokeWidth="1.4" strokeDasharray="4 4" />
        <circle cx="70" cy="50" r="5" fill="var(--muted)" />
        <path
          d="M 145 75 C 175 75, 180 25, 210 25 C 235 25, 240 60, 260 40"
          stroke="var(--trail)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="145" cy="75" r="5" fill="var(--trail)" />
        <circle cx="210" cy="25" r="4.5" fill="#fff" stroke="var(--trail)" strokeWidth="2" />
        <circle cx="260" cy="40" r="6" fill="var(--moss)" />
      </svg>
    );
  }
  if (kind === "clew") {
    return (
      <svg viewBox="0 0 280 100" className="h-full w-full" fill="none" aria-hidden="true">
        <circle cx="52" cy="50" r="22" stroke="var(--trail)" strokeWidth="1.3" strokeDasharray="3 3" />
        <circle cx="52" cy="50" r="13" stroke="var(--trail)" strokeWidth="1.6" />
        <circle cx="52" cy="50" r="5" fill="var(--trail)" />
        <path
          d="M 74 50 C 115 50, 125 28, 165 28 C 205 28, 210 68, 245 50"
          stroke="var(--trail)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="165" cy="28" r="5" fill="#fff" stroke="var(--ink)" strokeWidth="2" />
        <circle cx="245" cy="50" r="6.5" fill="var(--moss)" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 280 100" className="h-full w-full" fill="none" aria-hidden="true">
      <line x1="30" y1="28" x2="250" y2="28" stroke="var(--trail)" strokeWidth="1.5" strokeDasharray="3 5" opacity="0.55" />
      <line x1="30" y1="52" x2="250" y2="52" stroke="var(--trail)" strokeWidth="2.2" />
      <line x1="30" y1="76" x2="250" y2="76" stroke="var(--moss)" strokeWidth="7" strokeLinecap="round" opacity="0.18" />
      <line x1="30" y1="76" x2="250" y2="76" stroke="var(--moss)" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="30" cy="76" r="5" fill="var(--trail)" />
      <circle cx="250" cy="76" r="6" fill="var(--moss)" />
    </svg>
  );
}
