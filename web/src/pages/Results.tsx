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

const ARM_FOR_NOTE = 'graph_hybrid'

function RankingNote({ r, summary }: { r: EvalResult; summary: Record<string, ArmSummary> }) {
  const v = summary.vector, k = summary[ARM_FOR_NOTE], av = r.agent_view_held_out
  if (!v || !k || !av || !av.arms[ARM_FOR_NOTE]) return null
  const behind = v['hit@1'] > k['hit@1'] || v.mrr > k.mrr
  const a = av.arms[ARM_FOR_NOTE]
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  return (
    <div className="grid gap-1.5 rounded-xl border border-line bg-card p-4 text-sm">
      <h3 className="font-bold">{behind ? 'Where vector RAG ranks higher' : 'Ranking in practice'}</h3>
      {behind && (
        <p className="text-muted">
          On {r.repo}, vector RAG puts a changed file at #1 more often (top-1 {pct(v['hit@1'])} vs {pct(k['hit@1'])}, MRR {pct(v.mrr)} vs {pct(k.mrr)}).
          That is about the order of the list, not about speed or coverage.
        </p>
      )}
      <p className="text-muted">
        On the {av.commits} held-out commits, vector RAG was right at #1 and Klew + vector seeds was not on <b className="text-ink">{a.top1_lost}</b> commits.
        In <b className="text-ink">{a.top1_lost_in_pack} of {a.top1_lost}</b> of them the right file was still in Klew's pack{a.top1_lost_median_rank ? <>, typically at <b className="text-ink">#{a.top1_lost_median_rank}</b></> : null}.
        The agent got <b className="text-ink">none</b> of the changed files from vector RAG on <b className="text-ink">{av.baseline_none_in_context}</b> of {av.commits} commits, and from Klew + vector seeds on <b className="text-ink">{a.none_in_context}</b>.
      </p>
      <p className="text-muted">Latency doesn't depend on ranking order: Klew takes about 0.2–0.4 s per request either way.</p>
    </div>
  )
}

function HowToRead() {
  const rows: [string, string][] = [
    ['Right file in context', 'Share of the changed files that made it into the 2,000-token pack. This is what the agent actually reads, so it is our headline metric.'],
    ['Tokens per correct file', 'Context tokens spent for each changed file that made it in. Lower means cheaper.'],
    ['Recall@5', 'Share of the changed files that appear in the top five, ignoring the budget.'],
    ['Top-1', 'How often the #1 file is one that changed. It matters most for a single-answer search box; an agent reads the whole pack.'],
    ['MRR', 'Mean reciprocal rank: 1 if the first correct file is #1, ½ at #2, ⅓ at #3, and so on. It rewards putting the right file first.'],
    ['p50 latency', 'Median time per request. It depends on how many graph queries run, not on the ranking order.'],
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
          We replay a repository's real commits in order. Each commit message is the task, and the files that commit
          changed are the answer. Every approach gets the same 2,000-token budget. Klew learns from each commit
          after it answers, exactly as it would from a merged PR. The code is re-indexed at the parent commit every 50
          commits, so nothing sees the future.
        </p>
      </header>
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
                  ? <>Showing <b className="text-ink">{r.held_out_commits} held-out commits</b>: none of them were used to choose any setting. The first {r.tuned_on_first} commits were used for tuning.</>
                  : <>Showing <b className="text-ink">all {r.scored} commits</b>, including the {r.tuned_on_first} used for tuning (slightly favourable to Klew).</>}
              </span>
              <button type="button" onClick={() => setHeldOut(!useHeld)} className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:bg-card">
                {useHeld ? `Show all ${r.scored}` : `Show only the ${r.held_out_commits} held-out commits`}
              </button>
            </div>
          )}
          <Table r={r} summary={summary} />
          <RankingNote r={r} summary={summary} />
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
