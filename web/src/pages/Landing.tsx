import { useMemo, useState } from 'react'
import { Curve } from '../components/Curve'
import { useEvalResults } from '../useEval'

// Real output of `desirepath context --repo httpx "Support NO_PROXY environment variable with CIDR ranges" --budget 1200`
// right after `desirepath index` (warm start learned from 268 past commits). Trimmed to two items.
const HERO_SAMPLE = `> get_context("Support NO_PROXY environment variable with CIDR ranges")

## httpx/_utils.py   score 5.47
seed: name match: httpx/_utils.py; learned: 'environment' → this file
  def get_environment_proxies() -> dict[str, str | None]
      # Gets proxy information from the environment
  def is_ipv6_hostname(hostname: str) -> bool

## httpx/_client.py   score 3.52
seed: learned: 'variable' → this file
  def _get_proxy_map( self, proxy: ProxyTypes | None, allow_env_proxies: bool ) …

1,200 / 1,200 tokens · 571 ms`

const INSTALL = `git clone <this repo> && cd desirepath
docker compose up -d            # local HydraDB node
uv pip install -e .             # or: pip install -e .
desirepath index ~/code/your-repo
cd ~/code/your-repo && claude mcp add desirepath -- desirepath mcp`

function Stat({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="grid content-start gap-1 border-l-2 border-trail pl-4">
      <div className="font-display text-4xl font-bold tabular">{value}</div>
      <div className="font-medium">{label}</div>
      <div className="text-sm text-muted">{note}</div>
    </div>
  )
}

function Savings({ tokensSavedPerTask }: { tokensSavedPerTask: number }) {
  const [devs, setDevs] = useState(40)
  const [tasks, setTasks] = useState(25)
  const [price, setPrice] = useState(3)
  const monthly = (devs * tasks * 21 * tokensSavedPerTask * price) / 1_000_000
  return (
    <div className="grid gap-4 rounded-xl border border-line bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {([['devs', 'Engineers using agents', devs, setDevs, 1, 500],
           ['tasks', 'Agent tasks per engineer per day', tasks, setTasks, 1, 200],
           ['price', 'Input price, $ per 1M tokens', price, setPrice, 0.25, 20]] as const).map(([id, label, v, set, step, max]) => (
          <label key={id} className="grid gap-1.5 text-sm">
            <span className="text-muted">{label}</span>
            <input id={`calc-${id}`} type="number" min={0} max={max} step={step} value={v}
                   onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}
                   className="rounded-lg border border-line bg-paper px-3 py-2 font-mono tabular" />
          </label>
        ))}
      </div>
      <p className="text-sm text-muted">
        In our replay, each context lookup used about <b className="text-ink tabular">{Math.round(tokensSavedPerTask).toLocaleString()}</b> fewer
        input tokens than vector RAG while getting more of the right files into context. Over 21 working days that's:
      </p>
      <p className="font-display text-3xl font-bold tabular">${monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })} / month</p>
      <p className="text-xs text-muted">Counts one lookup per task. Agents usually look up several times per task, so this is a floor.</p>
    </div>
  )
}

export default function Landing() {
  const { results } = useEvalResults()
  const r = results?.find((x) => x.repo === 'httpx') ?? results?.[0]
  const s = r?.summary
  const stats = useMemo(() => {
    if (!s?.graph_learn || !s.vector) return null
    const g = s.graph_learn, v = s.vector, st = s.graph_static
    return {
      inContext: `${Math.round(g.budget_recall * 100)}%`,
      vsVector: `${Math.round(v.budget_recall * 100)}%`,
      tokenRatio: v.tokens_per_hit && g.tokens_per_hit ? (v.tokens_per_hit / g.tokens_per_hit).toFixed(1) : '–',
      learnLift: st ? `+${Math.round((g.budget_recall - st.budget_recall) * 100)} pts` : '–',
      savedPerTask: Math.max(0, v.tokens_mean - g.tokens_mean),
      commits: r?.scored ?? 0,
    }
  }, [s, r])

  return (
    <div>
      <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-14 pb-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="grid gap-5">
          <span className="eyebrow">Context layer for coding agents · built on HydraDB</span>
          <h1 className="text-5xl leading-[1.05] font-bold sm:text-6xl">
            Your agents wear a path through your code. <span className="text-trail">Desirepath remembers it.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted">
            Every session, a coding agent rediscovers your repo by grepping and pasting whole files. Desirepath hands it a
            small map instead: the functions, callers, tests and files that matter for this task, each with the path that
            connects it. Every merged PR teaches it which paths were right.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#app" className="rounded-lg bg-ink px-5 py-2.5 font-medium text-paper no-underline">Try it on httpx</a>
            <a href="#results" className="rounded-lg border border-line bg-card px-5 py-2.5 font-medium text-ink no-underline">See the evaluation</a>
            <a href="#docs/quickstart" className="rounded-lg px-3 py-2.5 font-medium text-trail no-underline">Read the docs →</a>
          </div>
        </div>
        <figure className="grid min-w-0 gap-2">
          <pre className="overflow-x-auto rounded-xl border border-line bg-card p-5 font-mono text-[0.8rem] leading-6 text-ink">{HERO_SAMPLE}</pre>
          <figcaption className="text-xs text-muted">Real output on a fresh install of httpx. Indexing learned from the repo’s last 268 commits, so the file that handles NO_PROXY is already on top.</figcaption>
        </figure>
      </section>

      {stats && r && (
        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            <Stat value={stats.inContext} label="right file in a 2k-token context"
                  note={`vs ${stats.vsVector} for vector RAG, over ${stats.commits} real ${r.repo} commits`} />
            <Stat value={`${stats.tokenRatio}×`} label="fewer tokens per correct file"
                  note="signatures and the right snippet, not 40-line chunks" />
            <Stat value={stats.learnLift} label="from learning alone"
                  note="same graph, with and without learning from past commits" />
          </div>
          <div className="grid gap-3 rounded-xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold">Sharper every run</h2>
              <span className="text-sm text-muted">share of changed files in context, trailing 50 commits</span>
            </div>
            <Curve result={r} metric="budget_recall" />
          </div>
        </section>
      )}

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6">
        <h2 className="text-3xl font-bold">How it works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            ['Map', 'Tree-sitter parses the repo into files, symbols, calls, imports, inheritance and tests. Git history adds which files change together. All of it lives in HydraDB on object storage.'],
            ['Walk', 'For a task, Desirepath seeds from names in the task, then walks calls, callers, tests and co-changes in HydraDB, hop by hop. It packs signatures and the best snippet into your token budget, with the path that justifies each file.'],
            ['Learn', 'When a run or PR lands, the files that actually changed reinforce the links from the task’s words to those files, and files it served that didn’t matter decay. Structure stays fact; experience is learned on top.'],
          ].map(([t, d]) => (
            <div key={t} className="grid content-start gap-2">
              <h3 className="text-xl font-bold text-trail">{t}</h3>
              <p className="text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <h2 className="text-3xl font-bold">Why a graph, not a vector store</h2>
          <ul className="grid list-disc gap-2 pl-5 text-muted">
            <li><b className="text-ink">The file you need often doesn’t look like the task.</b> It’s the caller, the test, or the config two hops away. Similarity can’t follow a call edge.</li>
            <li><b className="text-ink">It learns without re-embedding.</b> Outcomes update edge weights in place, so the graph improves with every merge.</li>
            <li><b className="text-ink">Every item says why it’s there.</b> A path through the code is auditable. A cosine score isn’t.</li>
            <li><b className="text-ink">It spends fewer tokens.</b> Structure tells it which signature and which body to include, so it doesn’t paste whole chunks.</li>
          </ul>
        </div>
        <div className="grid content-start gap-3">
          <h2 className="text-3xl font-bold">Install in a minute</h2>
          <pre className="overflow-x-auto rounded-xl border border-line bg-card p-5 font-mono text-sm leading-7">{INSTALL}</pre>
          <p className="text-sm text-muted">Add the <a className="text-trail" href="#docs/github-action">GitHub Action</a> and every merged PR teaches the graph, with no agent changes needed. Full setup for Claude Code, Cursor and others is in the <a className="text-trail" href="#docs/mcp">MCP docs</a>.</p>
        </div>
      </section>

      {stats && (
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:px-6">
          <h2 className="text-3xl font-bold">What it saves</h2>
          <Savings tokensSavedPerTask={stats.savedPerTask} />
        </section>
      )}

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6">
        <div className="grid gap-1">
          <h2 className="text-3xl font-bold">Proposed plans</h2>
          <p className="text-muted">The open-source core ships today. The hosted team graph is what we’d build next.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Open source', 'Free', 'Local MCP server, CLI and GitHub Action. Your graph, your machine.'],
            ['Team graph', '$18 / engineer / month', 'One shared, learned graph per repo on HydraDB object storage. Every engineer’s merges sharpen everyone’s agent.'],
            ['Enterprise', 'Talk to us', 'Self-hosted in your cloud, SSO, audit export of every context decision.'],
          ].map(([t, p, d], i) => (
            <div key={t} className={`grid content-start gap-2 rounded-xl border bg-card p-5 ${i === 1 ? 'border-trail' : 'border-line'}`}>
              <h3 className="text-lg font-bold">{t}</h3>
              <div className="font-mono text-sm text-trail">{p}</div>
              <p className="text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
