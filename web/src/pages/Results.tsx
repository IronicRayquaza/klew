import { useState } from 'react'
import { ARM_LABEL, type ArmSummary, type EvalResult } from '../api'
import { Curve } from '../components/Curve'
import { LearningCurve } from '../components/LearningCurve'
import { useEvalResults } from '../useEval'

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

function Table({ r, summary }: { r: EvalResult; summary: Record<string, ArmSummary> }) {
  const cols: [string, string, (v: number | null) => string][] = [
    ['budget_recall', 'Right file in context', (v) => pct(v ?? 0)],
    ['tokens_mean', 'Tokens used', (v) => Math.round(v ?? 0).toLocaleString()],
    ['tokens_per_hit', 'Tokens per correct file', (v) => (v == null ? '–' : Math.round(v).toLocaleString())],
    ['recall@5', 'Recall@5', (v) => pct(v ?? 0)],
    ['hit@1', 'Top-1', (v) => pct(v ?? 0)],
    ['mrr', 'MRR', (v) => pct(v ?? 0)],
    ['p50_ms', 'p50 latency', (v) => `${Math.round(v ?? 0)} ms`],
  ]
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="text-left">
            <th className="eyebrow px-4 py-3">Arm</th>
            {cols.map(([k, label]) => <th key={k} className="eyebrow px-4 py-3 text-right">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {r.arms.filter((a) => summary[a]).map((a) => (
            <tr key={a} className={`border-t border-line ${a === 'graph_learn' ? 'font-semibold' : ''}`}>
              <td className="px-4 py-2.5 whitespace-nowrap">{ARM_LABEL[a] ?? a}</td>
              {cols.map(([k, , fmt]) => (
                <td key={k} className="px-4 py-2.5 text-right font-mono">
                  {fmt((summary[a] as unknown as Record<string, number | null>)[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Comparisons({ r }: { r: EvalResult }) {
  const ci = r.ci_held_out
  if (!ci) return null
  const cols: [string, string][] = [['budget_recall', 'Right file in context'], ['recall@5', 'Recall@5'], ['hit@1', 'Top-1'], ['mrr', 'MRR']]
  const f = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">Key comparisons</h3>
        <span className="text-xs text-muted">difference in points, with a paired 95% interval over {ci.n} commits</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full text-sm tabular">
          <thead>
            <tr className="text-left">
              <th className="eyebrow px-4 py-3">Comparison</th>
              {cols.map(([k, l]) => <th key={k} className="eyebrow px-4 py-3 text-right">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {ci.comparisons.map((c) => (
              <tr key={c.label} className="border-t border-line">
                <td className="px-4 py-2.5 whitespace-nowrap">{c.label}</td>
                {cols.map(([k]) => {
                  const v = c.metrics[k]
                  return (
                    <td key={k} className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className={`font-mono ${v.significant ? (v.diff > 0 ? 'font-semibold text-moss' : 'font-semibold text-alarm') : 'text-muted'}`}>{f(v.diff)}</span>
                      <span className="ml-1.5 font-mono text-xs text-muted">[{f(v.lo)}, {f(v.hi)}]</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Bold green: the whole interval is above zero, so the difference is real at 95% confidence. Grey: the interval includes zero, so we can't call it a win or a loss.</p>
    </div>
  )
}

function HowWeTest({ results }: { results: EvalResult[] | null }) {
  const t = results?.find((r) => r.repo === (r.tuning_repo ?? 'httpx'))
  const tune = t?.slices?.tuning, held = t?.slices?.held_out
  const total = (tune?.commits ?? 0) + (held?.commits ?? 0)
  return (
    <section className="grid gap-4 rounded-xl border border-line bg-card p-5">
      <h2 className="text-xl font-bold">How we test, in plain words</h2>
      <ol className="grid list-decimal gap-2 pl-5 text-sm">
        <li><b>We replay real history.</b> We take a repository's real commits in date order. Each commit message (say, “Version 0.20”) is the task, and the files that commit changed are the right answer. Every approach gets the same 2,000-token budget and has to put the right files in front of the agent.</li>
        <li><b>We split time in two.</b> Klew has a few knobs, such as how strongly to blend in text search. We set them using only the earliest commits, then locked them. Everything we report is measured on the later commits, which we never looked at while setting the knobs. It is like grading a student on questions that weren't in their practice set.</li>
        <li><b>Learning is different from tuning.</b> Klew's graph keeps learning which files go with which words, but only <i>after</i> it has answered each commit, exactly as it would from a merged pull request. It never sees an answer before answering.</li>
      </ol>
      {tune && held && total > 0 && (
        <div className="grid gap-1.5">
          <div className="flex h-9 overflow-hidden rounded-lg text-xs font-medium">
            <div className="flex items-center justify-center bg-line px-2 text-ink" style={{ width: `${(tune.commits / total) * 100}%` }}>
              Tuning · {tune.commits} commits
            </div>
            <div className="flex items-center justify-center bg-trail px-2 text-paper" style={{ width: `${(held.commits / total) * 100}%` }}>
              Held-out · {held.commits} commits · what we report
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted">
            <span>{tune.from}</span><span>settings locked after {tune.to}</span><span>{held.to}</span>
          </div>
          <p className="text-xs text-muted">
            Timeline: {t?.repo}.{' '}
            {(results ?? []).filter((r) => r.repo !== t?.repo).map((r) => r.repo).join(' and ') || 'Other repositories'}{' '}
            {(results ?? []).filter((r) => r.repo !== t?.repo).length === 1 ? 'was' : 'were'} never used for tuning at all: every commit there is new to Klew.
          </p>
        </div>
      )}
    </section>
  )
}

function HowToRead() {
  const rows: [string, string][] = [
    ['Right file in context', 'Share of the changed files that made it into the 2,000-token pack. This is what the agent actually reads, so it is our headline metric.'],
    ['Tokens per correct file', 'Context tokens spent for each changed file that made it in. Lower means cheaper.'],
    ['Recall@5', 'Share of the changed files that appear in the top five, ignoring the budget.'],
    ['Top-1', 'How often the #1 file is one that changed.'],
    ['MRR', 'Mean reciprocal rank: 1 if the first correct file is #1, ½ at #2, ⅓ at #3, and so on. It rewards putting the right file first.'],
    ['p50 latency', 'Median time per request.'],
    ['95% interval', 'We resample the held-out commits 2,000 times to see how much a number could move by chance. If a difference stays above zero in 95% of resamples, it is a real difference, not luck.'],
  ]
  return (
    <section className="grid gap-3 rounded-xl border border-line bg-card p-5">
      <h2 className="text-xl font-bold">How to read these numbers</h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        {rows.map(([t, d]) => (
          <div key={t} className="contents">
            <dt className="font-medium">{t}</dt>
            <dd className="text-muted">{d}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function Results() {
  const { results, learning, source, error } = useEvalResults()
  const [metric, setMetric] = useState<'budget_recall' | 'recall@5'>('budget_recall')
  const [heldOut, setHeldOut] = useState(true)
  const ordered = results ? [...results].sort((a, b) => (a.repo === 'httpx' ? -1 : b.repo === 'httpx' ? 1 : 0)) : null
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-10 sm:px-6">
      <header className="grid gap-3">
        <span className="eyebrow">Evaluation · git-history replay</span>
        <h1 className="text-4xl font-bold">Does it beat a vector store, and does it get sharper?</h1>
        <p className="max-w-3xl text-muted">
          Real commits, replayed in order, with the same token budget for every approach. The numbers below are on commits
          that were never used to choose Klew's settings.
        </p>
      </header>
      <HowWeTest results={ordered} />
      <HowToRead />
      {error && <p className="text-alarm">Could not load results: {error}</p>}
      {!results && !error && <p className="text-muted">Loading results…</p>}
      {ordered?.map((r) => {
        const useHeld = heldOut && !!r.summary_held_out
        const summary = useHeld ? r.summary_held_out! : r.summary
        const gain = (a: string, b: string) => summary[a] && summary[b] ? (summary[a].budget_recall - summary[b].budget_recall) * 100 : null
        const learnGain = gain('graph_learn', 'graph_static')
        const graphGain = gain('graph_learn', 'graph_nowalk')
        const lc = learning.find((l) => l.repo === r.repo)
        return (
        <section key={r.repo} className="grid gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1">
              <h2 className="text-2xl font-bold">{r.repo}</h2>
              <p className="text-sm text-muted">
                {r.scored} commits scored · {r.history_commits_before_window} commits of history before the window ·
                <span className="font-mono"> {r.first_commit.slice(0, 8)}…{r.last_commit.slice(0, 8)}</span>
                {source === 'snapshot' && ' · snapshot'}
              </p>
            </div>
            <div className="flex rounded-lg border border-line bg-card p-1 text-sm" role="tablist">
              {(['budget_recall', 'recall@5'] as const).map((m) => (
                <button key={m} role="tab" aria-selected={metric === m} onClick={() => setMetric(m)}
                        className={`rounded-md px-3 py-1.5 ${metric === m ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}>
                  {m === 'budget_recall' ? 'Right file in 2k tokens' : 'Recall@5'}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card p-4"><Curve result={r} metric={metric} /></div>
          {r.summary_held_out && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted">
                {useHeld
                  ? <>Showing <b className="text-ink">{r.held_out_commits} held-out commits</b>{r.slices?.held_out.from ? ` (${r.slices.held_out.from} – ${r.slices.held_out.to})` : ''}.{' '}
                      {r.repo === r.tuning_repo
                        ? <>None were used to choose any setting; the first {r.tuned_on_first} ({r.slices?.tuning.from} – {r.slices?.tuning.to}) were.</>
                        : r.tuned_on_first
                          ? <>No {r.repo} commit was ever used to choose a setting (all tuning was on {r.tuning_repo ?? 'httpx'}); the first {r.tuned_on_first} are left out only to match httpx.</>
                          : <>Every commit is new to Klew: no {r.repo} commit was ever used to choose a setting (all tuning was on {r.tuning_repo ?? 'httpx'}).</>}</>
                  : <>Showing <b className="text-ink">all {r.scored} commits</b>{r.repo === r.tuning_repo ? <>, including the {r.tuned_on_first} used for tuning (slightly favourable to Klew)</> : null}.</>}
              </span>
              <button type="button" onClick={() => setHeldOut(!useHeld)} className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:bg-card">
                {useHeld ? `Show all ${r.scored}` : `Show only the ${r.held_out_commits} held-out commits`}
              </button>
            </div>
          )}
          <Table r={r} summary={summary} />
          <Comparisons r={r} />
          <div className="grid gap-4 md:grid-cols-2">
            {learnGain !== null && (
              <div className="grid content-start gap-2 rounded-xl border border-line bg-card p-4">
                <h3 className="font-bold">What learning adds</h3>
                <p className="text-sm text-muted">Same graph, learning off vs on (warm start plus learning from every replayed commit). Right file in context{useHeld ? ', held-out commits' : ''}:</p>
                <p className="font-display text-3xl font-bold tabular">{learnGain >= 0 ? '+' : ''}{learnGain.toFixed(1)} pts</p>
                {lc ? (
                  <>
                    <LearningCurve data={lc} height={240} />
                    <p className="text-xs text-muted">Held-out accuracy ({lc.held_out_commits} commits) after the graph learns from N past commits, with learning then frozen. Dotted lines: 0 commits learned (no learning).</p>
                  </>
                ) : (
                  <Curve result={r} metric="budget_recall" arms={['graph_static', 'graph_learn']} height={180} />
                )}
              </div>
            )}
            {graphGain !== null && (
              <div className="grid content-start gap-2 rounded-xl border border-line bg-card p-4">
                <h3 className="font-bold">What the graph adds</h3>
                <p className="text-sm text-muted">Klew with vs without walking the HydraDB graph (traversal and companions off; same seeds, learning and text fusion). Right file in context{useHeld ? ', held-out commits' : ''}:</p>
                <p className="font-display text-3xl font-bold tabular">{graphGain >= 0 ? '+' : ''}{graphGain.toFixed(1)} pts</p>
                <Curve result={r} metric="budget_recall" arms={['graph_nowalk', 'graph_learn']} height={180} />
              </div>
            )}
          </div>
        </section>
        )
      })}
      <section className="grid gap-3 text-sm text-muted">
        <h3 className="text-lg font-bold text-ink">Limits</h3>
        <ul className="grid list-disc gap-1.5 pl-5">
          <li>Commit messages are terser than real agent prompts, and we score Python files only.</li>
          <li>Parameters were tuned on the first 50 commits of the first repository only.</li>
          <li>Reproduce with <code className="rounded bg-code px-1.5 font-mono">klew eval path/to/repo --window 300</code>.</li>
        </ul>
      </section>
    </div>
  )
}
