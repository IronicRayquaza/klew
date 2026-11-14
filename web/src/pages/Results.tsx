import { useState } from 'react'
import { ARM_LABEL, type EvalResult } from '../api'
import { Curve } from '../components/Curve'
import { useEvalResults } from '../useEval'

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

function Table({ r }: { r: EvalResult }) {
  const cols: [string, string, (v: number | null) => string][] = [
    ['budget_recall', 'Right file in context', (v) => pct(v ?? 0)],
    ['tokens_mean', 'Tokens used', (v) => Math.round(v ?? 0).toLocaleString()],
    ['tokens_per_hit', 'Tokens per correct file', (v) => (v == null ? '–' : Math.round(v).toLocaleString())],
    ['recall@5', 'Recall@5', (v) => pct(v ?? 0)],
    ['hit@1', 'Top-1', (v) => pct(v ?? 0)],
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
          {r.arms.map((a) => (
            <tr key={a} className={`border-t border-line ${a === 'graph_learn' ? 'font-semibold' : ''}`}>
              <td className="px-4 py-2.5 whitespace-nowrap">{ARM_LABEL[a] ?? a}</td>
              {cols.map(([k, , fmt]) => (
                <td key={k} className="px-4 py-2.5 text-right font-mono">
                  {fmt((r.summary[a] as unknown as Record<string, number | null>)[k])}
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
  const { results, source, error } = useEvalResults()
  const [metric, setMetric] = useState<'budget_recall' | 'recall@5'>('budget_recall')
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-10 sm:px-6">
      <header className="grid gap-3">
        <span className="eyebrow">Evaluation · git-history replay</span>
        <h1 className="text-4xl font-bold">Does it beat a vector store, and does it get sharper?</h1>
        <p className="max-w-3xl text-muted">
          We replay a repository's real commits in order. Each commit message is the task, and the files that commit
          changed are the answer. Every approach gets the same 2,000-token budget. Desirepath learns from each commit
          after it answers, exactly as it would from a merged PR. The code is re-indexed at the parent commit every 50
          commits, so nothing sees the future.
        </p>
      </header>
      {error && <p className="text-alarm">Could not load results: {error}</p>}
      {!results && !error && <p className="text-muted">Loading results…</p>}
      {results?.map((r) => (
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
          <Table r={r} />
        </section>
      ))}
      <section className="grid gap-3 text-sm text-muted">
        <h3 className="text-lg font-bold text-ink">How to read this, and its limits</h3>
        <ul className="grid list-disc gap-1.5 pl-5">
          <li><b className="text-ink">Right file in context</b>: the share of changed files that made it into the 2,000-token context. This is what an agent actually reads.</li>
          <li><b className="text-ink">Recall@5</b>: the share of changed files among the top five ranked files, ignoring budget.</li>
          <li>Commit messages are terser than real agent prompts, and we score Python files only.</li>
          <li>Parameters were tuned on the first 50 commits of the first repository only.</li>
          <li>Reproduce with <code className="rounded bg-code px-1.5 font-mono">desirepath eval path/to/repo --window 300</code>.</li>
        </ul>
      </section>
    </div>
  )
}
