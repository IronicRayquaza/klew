import { useState } from "react";
import { ARM_LABEL, type ArmSummary, type EvalResult } from "../api";
import { Curve, type CurveMetric } from "../components/Curve";
import { IconArrowRight } from "../components/Icons";
import { LearningCurve } from "../components/LearningCurve";
import { useEvalResults } from "../useEval";

const ARMS = ["graph_hybrid", "graph_learn", "graph_nowalk", "graph_static", "vector", "bm25"];
const REPO_ORDER = ["httpx", "flask", "ods"];

function repoOrderKey(repoName: string): number {
  const lower = repoName.toLowerCase();
  const idx = REPO_ORDER.findIndex((k) => lower.includes(k));
  return idx === -1 ? 99 : idx;
}

export function Results({ onTry }: { onTry: () => void }) {
  const { results, learning, error } = useEvalResults();
  const [metric, setMetric] = useState<CurveMetric>("budget_recall");
  const [heldOut, setHeldOut] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<string>("httpx");

  if (error) {
    return (
      <div className="px-frame py-20 font-mono text-sm text-trail">
        Could not load evidence data: {error}
      </div>
    );
  }
  if (!results) {
    return (
      <div className="px-frame py-20 font-mono text-sm text-muted">
        Loading benchmark evidence…
      </div>
    );
  }

  const ordered = [...results].sort((a, b) => repoOrderKey(a.repo) - repoOrderKey(b.repo));
  const active =
    ordered.find((r) => r.repo.toLowerCase().includes(selectedRepo.toLowerCase())) ?? ordered[0];

  const useHeld = heldOut && !!active.summary_held_out;
  const summary: Record<string, ArmSummary> =
    (useHeld ? active.summary_held_out : null) ?? active.summary;
  const nCommits = useHeld ? (active.held_out_commits ?? active.scored) : active.scored;

  const hyb = summary.graph_hybrid;
  const learn = summary.graph_learn;
  const stat = summary.graph_static;
  const nowalk = summary.graph_nowalk;
  const vec = summary.vector;

  const learnGain =
    learn && stat ? (learn.budget_recall - stat.budget_recall) * 100 : null;
  const graphGain =
    learn && nowalk ? (learn.budget_recall - nowalk.budget_recall) * 100 : null;
  const lc = learning.find((l) => l.repo === active.repo);
  const totalHeldOut = results.reduce((n, r) => n + (r.held_out_commits ?? r.scored), 0);
  const armCount = active.arms.filter((a) => summary[a]).length;
  const learnMrrGain = learn && stat ? (learn.mrr - stat.mrr) * 100 : null;
  const av = active.agent_view_held_out;
  const blindKlew = av?.arms?.graph_hybrid?.none_in_context ?? av?.arms?.graph_learn?.none_in_context;

  return (
    <div className="w-full">
      {/* =====================================================================
          HERO & REPOSITORY SELECTOR
         ===================================================================== */}
      <section className="px-frame pt-12 pb-16 sm:pt-18 sm:pb-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center rounded-full border border-line bg-card px-4 py-1.5 font-mono text-xs text-muted shadow-2xs">
            <span>Evidence · {totalHeldOut} held-out commits across {results.length} repos</span>
          </div>

          <h1 className="mt-6 font-display text-[clamp(2.25rem,4.2vw,3.6rem)] font-semibold leading-[1.06] tracking-[-0.03em] text-ink">
            Does the graph thread earn its place over a vector store?
          </h1>

          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            We replay real git commits in chronological order. At each commit, the commit message is
            the task, every method gets the exact same{" "}
            <strong className="font-medium text-ink">2,000-token</strong> budget, and we score
            against the files that commit actually modified - before letting Klew learn from it.
          </p>
        </div>

        {/* Sticky / Floating Filter Bar */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
          {/* Repository Switcher Pills */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-line bg-card p-1.5 shadow-2xs">
            {ordered.map((r) => {
              const isSel = r.repo === active.repo;
              return (
                <button
                  key={r.repo}
                  type="button"
                  onClick={() => setSelectedRepo(r.repo)}
                  className={`btn-soft rounded-full px-5 py-2 font-mono text-xs font-medium ${
                    isSel ? "bg-ink text-paper shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  {r.repo}
                </button>
              );
            })}
          </div>

          {/* Held-Out vs All Commits Switch */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-line bg-card p-1 text-xs">
              <button
                type="button"
                onClick={() => setHeldOut(true)}
                className={`btn-soft rounded-full px-4 py-1.5 font-medium ${
                  heldOut ? "bg-ink text-paper" : "text-muted hover:text-ink"
                }`}
              >
                Held-out ({active.held_out_commits ?? active.scored})
              </button>
              <button
                type="button"
                onClick={() => setHeldOut(false)}
                className={`btn-soft rounded-full px-4 py-1.5 font-medium ${
                  !heldOut ? "bg-ink text-paper" : "text-muted hover:text-ink"
                }`}
              >
                All ({active.scored})
              </button>
            </div>

            <button
              type="button"
              onClick={onTry}
              className="btn-soft inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 font-mono text-xs font-medium text-ink hover:border-ink/40"
            >
              <span>Open Playground</span>
              <IconArrowRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* =====================================================================
          KEY NUMBERS FOR SELECTED REPOSITORY
         ===================================================================== */}
      <section className="px-frame pb-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="surface-card p-8 sm:p-9">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">
              Right File in 2k Pack
            </div>
            <div className="num mt-3 font-display text-5xl font-semibold text-ink">
              {(((hyb ?? learn)?.budget_recall ?? 0) * 100).toFixed(1)}%
            </div>
            <div className="num mt-2 font-mono text-xs text-ink">
              Klew standalone: {((learn?.budget_recall ?? 0) * 100).toFixed(1)}% · Vector RAG:{" "}
              {((vec?.budget_recall ?? 0) * 100).toFixed(1)}%
            </div>
          </div>

          <div className="surface-card p-8 sm:p-9">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">
              Top-1 File Precision
            </div>
            <div className="num mt-3 font-display text-5xl font-semibold text-ink">
              {(((hyb ?? learn)?.["hit@1"] ?? 0) * 100).toFixed(1)}%
            </div>
            <div className="num mt-2 font-mono text-xs text-ink">
              Klew standalone: {((learn?.["hit@1"] ?? 0) * 100).toFixed(1)}% · Vector RAG:{" "}
              {((vec?.["hit@1"] ?? 0) * 100).toFixed(1)}%
            </div>
          </div>

          <div className="surface-card p-8 sm:p-9">
            <div className="font-mono text-xs uppercase tracking-wider text-muted">
              Blind starts (no right file in pack)
            </div>
            <div className="num mt-3 font-display text-5xl font-semibold text-ink">
              {blindKlew ?? "-"}{" "}
              <span className="font-sans text-xl font-normal text-muted">
                vs {av?.baseline_none_in_context ?? "-"}
              </span>
            </div>
            <div className="mt-2 font-mono text-xs text-ink">
              of {av?.commits ?? active.held_out_commits ?? active.scored} held-out tasks · Klew + vector seeds vs{" "}
              {ARM_LABEL[av?.baseline ?? "vector"] ?? av?.baseline}. Lower is better.
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          FULL-WIDTH TRAJECTORY GRAPH (LARGE & BREATHABLE)
         ===================================================================== */}
      <section className="px-frame py-8">
        <div className="surface-card p-7 sm:p-12">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-muted">
                Chronological Trajectory · {active.repo}
              </span>
              <h2 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">
                Trailing-50 commit accuracy across git history
              </h2>
              <p className="mt-1 text-sm text-muted">
                {active.history_commits_before_window} commits of history before the window ·{" "}
                <span className="font-mono text-xs">
                  {active.first_commit.slice(0, 8)}…{active.last_commit.slice(0, 8)}
                </span>
              </p>
            </div>

            <div className="flex rounded-full bg-paper p-1 text-xs font-medium">
              {(["budget_recall", "recall@5"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={`btn-soft rounded-full px-4 py-1.5 ${
                    metric === m ? "bg-card text-ink shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  {m === "budget_recall" ? "Right file in 2k tokens" : "Recall@5"}
                </button>
              ))}
            </div>
          </div>

          <Curve result={active} metric={metric} height={540} />
        </div>
      </section>

      {/* =====================================================================
          SPACIOUS BENCHMARK COMPARISON TABLE
         ===================================================================== */}
      <section className="px-frame py-12">
        <div className="surface-card overflow-hidden p-7 sm:p-10">
          <div className="mb-6">
            <span className="font-mono text-xs uppercase tracking-wider text-muted">
              Method Breakdown · {nCommits} {useHeld ? "Held-Out" : "Replayed"} Commits
            </span>
            <h3 className="mt-1 font-display text-2xl font-semibold text-ink">
              All {armCount} approaches compared
            </h3>
          </div>

          <Table r={active} summary={summary} />
        </div>
      </section>

      {useHeld && active.ci_held_out && (
        <section className="px-frame py-4">
          <div className="surface-card overflow-hidden p-7 sm:p-10">
            <Comparisons r={active} />
          </div>
        </section>
      )}

      {/* =====================================================================
          LARGE FULL-WIDTH CONTINUAL LEARNING & GRAPH ABLATION CHARTS
         ===================================================================== */}
      <section className="px-frame py-12">
        <div className="grid grid-cols-1 gap-10">
          {learnGain !== null && (
            <div className="surface-card p-7 sm:p-12">
              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
                <div className="max-w-2xl">
                  <span className="font-mono text-xs uppercase tracking-wider text-moss">
                    Ablation 01 · Continual Learning
                  </span>
                  <h3 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">
                    What learning from merged PRs adds
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {lc
                      ? `Held-out accuracy (${lc.held_out_commits} commits) after Klew learns from N past commits strictly before the test window, then freezes all weights.`
                      : "Same HydraDB graph and 2,000-token budget, comparing learning off vs. learning from every replayed commit."}
                  </p>
                </div>

                <div className="text-right">
                  <div className="num rounded-2xl bg-moss-soft px-5 py-3 font-display text-3xl font-semibold text-moss">
                    {(learnMrrGain ?? learnGain) >= 0 ? "+" : ""}
                    {(learnMrrGain ?? learnGain).toFixed(1)} pts
                  </div>
                  <div className="mt-1.5 font-mono text-[11px] text-muted">
                    {learnMrrGain !== null ? "MRR" : "right file in context"}, learning on vs off
                  </div>
                </div>
              </div>

              {lc ? (
                <LearningCurve data={lc} height={350} />
              ) : (
                <Curve
                  result={active}
                  metric="budget_recall"
                  arms={["graph_static", "graph_learn"]}
                  height={340}
                />
              )}
            </div>
          )}

          {graphGain !== null && (
            <div className="surface-card p-7 sm:p-12">
              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
                <div className="max-w-2xl">
                  <span className="font-mono text-xs uppercase tracking-wider text-trail">
                    Ablation 02 · Graph Traversal
                  </span>
                  <h3 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">
                    With vs. without walking the HydraDB graph
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Compares full Klew against <code className="font-mono text-xs text-ink">graph_nowalk</code>{" "}
                    (2-hop traversal and companion links disabled; same seeds, learned links, and text fusion).
                  </p>
                </div>

                <div className="text-right">
                  <div className="num rounded-2xl bg-trail-soft px-5 py-3 font-display text-3xl font-semibold text-trail">
                    {graphGain >= 0 ? "+" : ""}
                    {graphGain.toFixed(1)} pts
                  </div>
                  <div className="mt-1.5 font-mono text-[11px] text-muted">right file in context, walk on vs off</div>
                </div>
              </div>

              <Curve
                result={active}
                metric="budget_recall"
                arms={["graph_nowalk", "graph_learn"]}
                height={340}
              />
            </div>
          )}
        </div>
      </section>

      <section className="px-frame grid gap-10 pt-4 pb-20 lg:grid-cols-2">
        <HowWeTest results={ordered} />
        <HowToRead />
      </section>
    </div>
  );
}

function Comparisons({ r }: { r: EvalResult }) {
  const ci = r.ci_held_out;
  if (!ci) return null;
  const cols: [string, string][] = [
    ["budget_recall", "Right file in context"],
    ["recall@5", "Recall@5"],
    ["hit@1", "Top-1"],
    ["mrr", "MRR"],
  ];
  const f = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`;
  return (
    <div className="grid gap-4">
      <div>
        <span className="font-mono text-xs uppercase tracking-wider text-muted">
          Paired 95% bootstrap interval · {ci.n} held-out commits
        </span>
        <h3 className="mt-1 font-display text-2xl font-semibold text-ink">Key comparisons</h3>
        <p className="mt-1 text-sm text-muted">Difference in points, with the 95% interval in brackets.</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-collapse text-left font-mono text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-[11px] uppercase tracking-wider text-muted">
              <th className="py-3.5 pl-5 pr-4">Comparison</th>
              {cols.map(([k, l]) => (
                <th key={k} className="py-3.5 px-4 text-right whitespace-nowrap">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="num">
            {ci.comparisons.map((c) => (
              <tr key={c.label} className="border-b border-line last:border-b-0">
                <td className="py-4 pl-5 pr-4 whitespace-nowrap text-ink">{c.label}</td>
                {cols.map(([k]) => {
                  const v = c.metrics[k];
                  if (!v) return <td key={k} className="py-4 px-4 text-right text-muted">-</td>;
                  const tone = v.significant
                    ? v.diff > 0
                      ? "font-semibold text-moss"
                      : "font-semibold text-trail"
                    : "text-muted";
                  return (
                    <td key={k} className="py-4 px-4 text-right whitespace-nowrap">
                      <span className={tone}>{f(v.diff)}</span>
                      <span className="ml-1.5 text-[11px] text-muted">
                        [{f(v.lo)}, {f(v.hi)}]
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Bold: the whole interval is on one side of zero, so the difference is real at 95% confidence (green better,
        amber worse). Grey: the interval includes zero, so we can't call it a win or a loss.
      </p>
    </div>
  );
}

function HowWeTest({ results }: { results: EvalResult[] }) {
  const t = results.find((r) => r.repo === (r.tuning_repo ?? "httpx"));
  const tune = t?.slices?.tuning;
  const held = t?.slices?.held_out;
  const total = (tune?.commits ?? 0) + (held?.commits ?? 0);
  const others = results.filter((r) => r.repo !== t?.repo).map((r) => r.repo);
  return (
    <div className="surface-card p-7 sm:p-10">
      <span className="font-mono text-xs uppercase tracking-wider text-muted">Method</span>
      <h3 className="mt-1 font-display text-2xl font-semibold text-ink">How we test, in plain words</h3>
      <ol className="mt-4 grid list-decimal gap-3 pl-5 text-sm leading-relaxed text-muted">
        <li>
          <b className="font-medium text-ink">We replay real history.</b> Each commit message is the task, and the
          files that commit changed are the right answer. Every approach gets the same 2,000-token budget.
        </li>
        <li>
          <b className="font-medium text-ink">We split time in two.</b> Klew's settings were chosen using only the
          earliest commits, then locked. Everything we report is measured on later commits we never looked at while
          tuning.
        </li>
        <li>
          <b className="font-medium text-ink">Learning is not tuning.</b> The graph learns which files go with which
          words only <i>after</i> it has answered each commit, as it would from a merged PR. It never sees an answer
          before answering.
        </li>
      </ol>
      {tune && held && total > 0 && (
        <div className="mt-6 grid gap-1.5">
          <div className="flex h-9 overflow-hidden rounded-xl font-mono text-[11px] font-medium">
            <div
              className="flex items-center justify-center bg-line px-2 text-ink"
              style={{ width: `${(tune.commits / total) * 100}%` }}
            >
              Tuning · {tune.commits}
            </div>
            <div
              className="flex items-center justify-center bg-trail px-2 text-paper"
              style={{ width: `${(held.commits / total) * 100}%` }}
            >
              Held-out · {held.commits} · reported
            </div>
          </div>
          <div className="flex justify-between font-mono text-[11px] text-muted">
            <span>{tune.from}</span>
            <span>locked after {tune.to}</span>
            <span>{held.to}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Timeline: {t?.repo}. {others.join(" and ") || "Other repositories"}{" "}
            {others.length === 1 ? "was" : "were"} never used for tuning: every commit there is new to Klew.
          </p>
        </div>
      )}
    </div>
  );
}

function HowToRead() {
  const rows: [string, string][] = [
    ["Right file in context", "Share of the changed files that made it into the 2,000-token pack. This is what the agent actually reads, so it is our headline metric."],
    ["Tokens per correct file", "Context tokens spent for each changed file that made it in. Lower is cheaper."],
    ["Recall@5", "Share of the changed files that appear in the top five, ignoring the budget."],
    ["Top-1", "How often the #1 file is one that changed."],
    ["MRR", "Mean reciprocal rank: 1 if the first correct file is #1, ½ at #2, ⅓ at #3, and so on."],
    ["p50 latency", "Median time per request."],
    ["95% interval", "We resample the held-out commits 2,000 times. If a difference stays above zero in 95% of resamples, it is real, not luck."],
  ];
  return (
    <div className="surface-card p-7 sm:p-10">
      <span className="font-mono text-xs uppercase tracking-wider text-muted">Glossary</span>
      <h3 className="mt-1 font-display text-2xl font-semibold text-ink">How to read these numbers</h3>
      <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[max-content_1fr]">
        {rows.map(([term, def]) => (
          <div key={term} className="contents">
            <dt className="font-medium text-ink">{term}</dt>
            <dd className="text-muted">{def}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Table({ r, summary }: { r: EvalResult; summary: Record<string, ArmSummary> }) {
  const arms = ARMS.filter((a) => r.arms.includes(a) && summary[a]);
  const best = (key: keyof ArmSummary, low = false) => {
    const vals = arms
      .map((a) => summary[a]?.[key])
      .filter((v): v is number => typeof v === "number");
    return vals.length ? (low ? Math.min(...vals) : Math.max(...vals)) : null;
  };
  const bRec = best("budget_recall");
  const bR5 = best("recall@5");
  const bH1 = best("hit@1");
  const bMrr = best("mrr");
  const bTph = best("tokens_per_hit", true);

  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full border-collapse text-left font-mono text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-line bg-paper text-[11px] uppercase tracking-wider text-muted">
            <th className="py-3.5 pl-5 pr-4">Method</th>
            <th className="py-3.5 px-4 text-right">In 2k tok</th>
            <th className="py-3.5 px-4 text-right">Recall@5</th>
            <th className="py-3.5 px-4 text-right">Top-1</th>
            <th className="py-3.5 px-4 text-right">MRR</th>
            <th className="py-3.5 px-4 text-right">Tok / hit</th>
            <th className="py-3.5 pl-4 pr-5 text-right">p50</th>
          </tr>
        </thead>
        <tbody className="num">
          {arms.map((a) => {
            const s = summary[a];
            const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
            return (
              <tr
                key={a}
                className={`border-b border-line last:border-b-0 ${
                  a === "graph_hybrid"
                    ? "bg-trail-soft/65 font-semibold"
                    : a === "graph_learn"
                      ? "bg-moss-soft/45 font-medium"
                      : ""
                }`}
              >
                <td className="py-4 pl-5 pr-4 text-ink">
                  {ARM_LABEL[a] ?? a}
                </td>
                <td
                  className={`py-4 px-4 text-right ${
                    s.budget_recall === bRec ? "font-semibold text-ink" : "text-ink"
                  }`}
                >
                  {pct(s.budget_recall)}
                </td>
                <td
                  className={`py-4 px-4 text-right ${
                    s["recall@5"] === bR5 ? "font-semibold text-ink" : "text-ink"
                  }`}
                >
                  {pct(s["recall@5"])}
                </td>
                <td
                  className={`py-4 px-4 text-right ${
                    s["hit@1"] === bH1 ? "font-semibold text-ink" : "text-ink"
                  }`}
                >
                  {pct(s["hit@1"])}
                </td>
                <td
                  className={`py-4 px-4 text-right ${
                    s.mrr === bMrr ? "font-semibold text-ink" : "text-ink"
                  }`}
                >
                  {pct(s.mrr)}
                </td>
                <td
                  className={`py-4 px-4 text-right ${
                    s.tokens_per_hit === bTph ? "font-semibold text-ink" : "text-ink"
                  }`}
                >
                  {s.tokens_per_hit == null ? "-" : Math.round(s.tokens_per_hit).toLocaleString()}
                </td>
                <td className="py-4 pl-4 pr-5 text-right text-muted">
                  {Math.round(s.p50_ms)} ms
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
