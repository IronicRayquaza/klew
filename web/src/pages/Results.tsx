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
          We replay a repository's real commits in order. Each commit message is the task, and the files that commit
          changed are the answer. Every approach gets the same 2,000-token budget. Klew learns from each commit
          after it answers, exactly as it would from a merged PR. The code is re-indexed at the parent commit every 50
          commits, so nothing sees the future.
        </p>
      </header>
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
            <label className="flex items-center gap-2 text-sm text-muted">
              <input id={`held-${r.repo}`} type="checkbox" checked={heldOut} onChange={(e) => setHeldOut(e.target.checked)} />
              Show only the {r.held_out_commits} held-out commits (the first {r.tuned_on_first} were used for tuning)
            </label>
          )}
          <Table r={r} summary={summary} />
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
        <h3 className="text-lg font-bold text-ink">How to read this, and its limits</h3>
        <ul className="grid list-disc gap-1.5 pl-5">
          <li><b className="text-ink">Right file in context</b>: the share of changed files that made it into the 2,000-token context. This is what an agent actually reads.</li>
          <li><b className="text-ink">Recall@5</b>: the share of changed files among the top five ranked files, ignoring budget.</li>
          <li>Commit messages are terser than real agent prompts, and we score Python files only.</li>
          <li>Parameters were tuned on the first 50 commits of the first repository only.</li>
          <li>Reproduce with <code className="rounded bg-code px-1.5 font-mono">klew eval path/to/repo --window 300</code>.</li>
        </ul>
      </section>
    </div>
  )
}
