import { useEffect, useState } from 'react'
import { api, snapshot, type EvalResult } from './api'

export function useEvalResults() {
  const [results, setResults] = useState<EvalResult[] | null>(null)
  const [source, setSource] = useState<'live' | 'snapshot'>('snapshot')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await api.evalList()
        const full = await Promise.all(list.map((e) => api.evalOne(e.name)))
        if (alive) { setResults(full); setSource('live') }
      } catch {
        try {
          const names = await snapshot<string[]>('eval-index.json')
          const full = await Promise.all(names.map((n) => snapshot<EvalResult>(`eval-${n}.json`)))
          if (alive) { setResults(full); setSource('snapshot') }
        } catch (e) {
          if (alive) setError(String(e))
        }
      }
    })()
    return () => { alive = false }
  }, [])
  return { results, source, error }
}
