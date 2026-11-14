// Types mirror klew/models.py and klew/api.py. Keep them in sync.
export type PathStep = { node_id: number; node: string; via: string | null; weight: number | null }
export type ContextItem = {
  file_id: number; path: string; score: number; tokens: number
  symbols: string[]; snippet: string; why: PathStep[]; seed_reason: string
}
export type Timings = { seed_ms: number; walk_ms: number; rank_ms: number; pack_ms: number; total_ms: number; queries: number }
export type ContextPack = {
  run_id: number; repo: string; task: string; items: ContextItem[]; tokens: number
  budget_tokens: number; abstained: boolean; abstain_reason: string; timings: Timings
}
export type LearnReport = {
  run_id: number; hits: string[]; misses: string[]; unserved: string[]
  edges_reinforced: number; edges_decayed: number; edges_created: number
}
export type GraphStats = { repo: string; files: number; symbols: number; terms: number; runs: number; edges: Record<string, number> }
export type Repo = { id: number; repo: string; root: string; head: string; runs: number | null }
export type ArmSummary = {
  'recall@5': number; 'recall@10': number; 'hit@1': number; mrr: number; budget_recall: number
  tokens_mean: number; p50_ms: number; p95_ms: number; tokens_per_hit: number | null
  'recall@5_first_half': number; 'recall@5_second_half': number
}
export type EvalResult = {
  repo: string; window: number; scored: number; budget_tokens: number; arms: string[]
  first_commit: string; last_commit: string; history_commits_before_window: number
  summary: Record<string, ArmSummary>
  summary_held_out?: Record<string, ArmSummary> | null
  tuned_on_first?: number
  held_out_commits?: number
  agent_view_held_out?: {
    baseline: string; commits: number; baseline_none_in_context: number
    arms: Record<string, { top1_lost: number; top1_lost_in_pack: number; top1_lost_median_rank: number | null; none_in_context: number }>
  } | null
  curves: Record<string, { 'recall@5': number[]; budget_recall: number[] }>
  runtime_s: number
}

// Dev (vite on :5173) talks to the local API; a production build is served by the API itself.
const BASE = (import.meta.env.VITE_API as string | undefined) ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => call<{ status: string }>('/api/health'),
  repos: () => call<Repo[]>('/api/repos'),
  stats: (repo: string) => call<GraphStats>(`/api/stats?repo=${encodeURIComponent(repo)}`),
  context: (repo: string, task: string, budget_tokens: number) =>
    call<ContextPack>('/api/context', { method: 'POST', body: JSON.stringify({ repo, task, budget_tokens }) }),
  outcome: (repo: string, run_id: number, touched_files: string[]) =>
    call<LearnReport>('/api/outcome', { method: 'POST', body: JSON.stringify({ repo, run_id, touched_files }) }),
  evalList: () => call<{ name: string; repo: string; scored: number }[]>('/api/eval'),
  evalOne: (name: string) => call<EvalResult>(`/api/eval/${encodeURIComponent(name)}`),
  learning: () => call<import('./components/LearningCurve').LearningCurveData[]>('/api/learning'),
}

// Snapshot mode: the static build ships precomputed results so it works with no backend.
export async function snapshot<T>(file: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}snapshot/${file}`)
  if (!res.ok) throw new Error(`snapshot ${file} missing`)
  return res.json() as Promise<T>
}

export async function backendUp(): Promise<boolean> {
  try {
    await Promise.race([api.health(), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 1200))])
    return true
  } catch {
    return false
  }
}

export const ARM_LABEL: Record<string, string> = {
  vector: 'Vector RAG',
  bm25: 'BM25 RAG',
  graph_static: 'Klew, learning off',
  graph_nowalk: 'Klew without graph traversal',
  graph_learn: 'Klew',
  graph_hybrid: 'Klew + vector seeds',
}
export const ARM_COLOR: Record<string, string> = {
  vector: 'var(--sky)',
  bm25: 'var(--muted)',
  graph_static: 'var(--line)',
  graph_nowalk: 'var(--alarm)',
  graph_learn: 'var(--trail)',
  graph_hybrid: 'var(--moss)',
}
