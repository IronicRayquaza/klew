import { useEffect, useState } from 'react'
import { api, backendUp, snapshot, type ContextPack, type GraphStats, type LearnReport, type Repo } from '../api'
import { PathGraph } from '../components/PathGraph'
import { WhyPath } from '../components/WhyPath'

const EXAMPLES = [
  'Support NO_PROXY environment variable with CIDR ranges',
  'Raise ReadTimeout when the server stalls while streaming the response body',
  'Client.send should not follow redirects to another origin with auth headers',
]

export default function Dashboard() {
  const [live, setLive] = useState<boolean | null>(null)
  const [demo, setDemo] = useState(false)
  const [repos, setRepos] = useState<Repo[]>([])
  const [repo, setRepo] = useState('')
  const [stats, setStats] = useState<GraphStats | null>(null)
  const [task, setTask] = useState(EXAMPLES[0])
  const [budget, setBudget] = useState(2000)
  const [pack, setPack] = useState<ContextPack | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState('')
  const [report, setReport] = useState<LearnReport | null>(null)

  useEffect(() => {
    ;(async () => {
      const up = await backendUp()
      setLive(up)
      if (up) api.health().then((h) => setDemo(!!h.demo)).catch(() => {})
      if (up) {
        const rs = await api.repos().catch(() => [])
        setRepos(rs)
        if (rs[0]) setRepo(rs[0].repo)
      } else {
        const packs = await snapshot<ContextPack[]>('packs.json').catch(() => [])
        if (packs[0]) { setPack(packs[0]); setTask(packs[0].task); setRepo(packs[0].repo) }
      }
    })()
  }, [])

  useEffect(() => {
    if (live && repo) api.stats(repo).then(setStats).catch(() => setStats(null))
  }, [live, repo, report])

  async function run() {
    setBusy(true); setError(null); setReport(null); setTouched(new Set())
    try {
      setPack(await api.context(repo, task, budget))
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  async function teach() {
    if (!pack) return
    const files = [...touched, ...extra.split(/[\s,]+/).filter(Boolean)]
    if (!files.length) return
    try {
      setReport(await api.outcome(repo, pack.run_id, files))
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  const toggle = (p: string) => setTouched((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-10 sm:px-6">
      <header className="grid gap-3">
        <span className="eyebrow">Live context</span>
        <h1 className="text-4xl font-bold">Ask for context, then teach it what you changed</h1>
        {demo && (
          <p className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted">
            This is a shared public demo on a free server with a tenth of a CPU, so each query takes several seconds
            (about 0.3 s on a laptop). The httpx and flask graphs start pre-trained on their history; what you teach
            here is shared with other visitors and resets when the server restarts.
          </p>
        )}
        {live === false && (
          <p className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted">
            You're viewing a recorded run. To try your own tasks, start the API with
            <code className="mx-1 rounded bg-code px-1.5 font-mono text-ink">klew serve</code> and reload.
          </p>
        )}
      </header>

      <section className="grid gap-4 rounded-xl border border-line bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="grid gap-1.5">
            <span className="eyebrow">Task</span>
            <textarea id="task" rows={2} value={task} onChange={(e) => setTask(e.target.value)} disabled={!live}
                      className="w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 font-sans text-ink" />
          </label>
          <div className="grid content-start gap-1.5">
            <span className="eyebrow">Repository</span>
            <select id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} disabled={!live}
                    className="rounded-lg border border-line bg-paper px-3 py-2 text-ink">
              {repos.length ? repos.map((r) => <option key={r.repo} value={r.repo}>{r.repo}</option>) : <option>{repo || 'none'}</option>}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Budget
            <input id="budget" type="range" min={500} max={6000} step={250} value={budget}
                   onChange={(e) => setBudget(Number(e.target.value))} disabled={!live} />
            <span className="w-24 font-mono text-ink tabular">{budget.toLocaleString()} tok</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setTask(ex)} disabled={!live}
                      className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink disabled:opacity-50">
                {ex.length > 44 ? ex.slice(0, 44) + '…' : ex}
              </button>
            ))}
          </div>
          <button type="button" onClick={run} disabled={!live || busy || !repo}
                  className="ml-auto rounded-lg bg-ink px-5 py-2 font-medium text-paper disabled:opacity-50">
            {busy ? (demo ? 'Walking the graph… (a few seconds on the free server)' : 'Walking the graph…') : 'Get context'}
          </button>
        </div>
        {error && <p className="text-sm text-alarm">{error}</p>}
      </section>

      {pack && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold">Context pack</h2>
              <span className="min-w-0 font-mono text-sm text-muted tabular">
                {pack.tokens.toLocaleString()} / {pack.budget_tokens.toLocaleString()} tokens · {Math.round(pack.timings.total_ms)} ms · {pack.timings.queries} graph queries
              </span>
            </div>
            {pack.abstained && <p className="rounded-lg border border-line bg-card p-4 text-muted">No confident context: {pack.abstain_reason}.</p>}
            {pack.items.map((it, i) => (
              <article key={it.file_id} className="grid gap-2 rounded-xl border border-line bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 font-mono text-sm text-muted tabular">{String(i + 1).padStart(2, '0')}</span>
                  <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-medium break-all">{it.path}</span>
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        <input type="checkbox" checked={touched.has(it.path)} onChange={() => toggle(it.path)} disabled={!live} />
                        I changed this
                      </label>
                    </div>
                    <WhyPath steps={it.why} reason={it.seed_reason} />
                    {it.symbols.length > 0 && (
                      <pre className="overflow-x-auto rounded-lg bg-code p-3 font-mono text-[0.78rem] leading-5">{it.symbols.join('\n')}</pre>
                    )}
                    {it.snippet && (
                      <details>
                        <summary className="cursor-pointer text-sm text-muted">Snippet · {it.tokens} tokens</summary>
                        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-code p-3 font-mono text-[0.78rem] leading-5">{it.snippet}</pre>
                      </details>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
            <h2 className="text-xl font-bold">Why these files</h2>
            <PathGraph pack={pack} />
            <div className="flex flex-wrap gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-trail" /> seed from the task</span>
              <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-sky" /> symbol on the path</span>
              <span className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full bg-moss" /> file served</span>
            </div>

            <div className="grid gap-3 rounded-xl border border-line bg-card p-4">
              <h3 className="font-bold">Teach it</h3>
              <p className="text-sm text-muted">Tick the files you actually changed, and add any it missed. Klew strengthens the paths that led there and weakens the ones that didn't.</p>
              <input id="extra" value={extra} onChange={(e) => setExtra(e.target.value)} disabled={!live}
                     placeholder="other changed files, e.g. httpx/_utils.py"
                     className="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm" />
              <button type="button" onClick={teach} disabled={!live || (!touched.size && !extra.trim())}
                      className="rounded-lg border border-ink px-4 py-2 font-medium disabled:opacity-40">Record outcome</button>
              {report && (
                <div className="grid gap-1 text-sm">
                  <p><b className="text-moss">{report.edges_created}</b> learned edges created, <b>{report.edges_reinforced}</b> reinforced, <b>{report.edges_decayed}</b> weakened.</p>
                  {report.unserved.length > 0 && <p className="text-muted">Missed this time, linked for next time: <span className="font-mono">{report.unserved.join(', ')}</span></p>}
                  <p className="text-muted">Run the same task again to see the new ranking.</p>
                </div>
              )}
            </div>

            {stats && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[['files', stats.files], ['symbols', stats.symbols], ['learned links', stats.edges.POINTS_TO ?? 0], ['runs', stats.runs]].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg border border-line bg-card px-3 py-2">
                    <div className="eyebrow">{k}</div>
                    <div className="font-mono text-lg tabular">{Number(v).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
