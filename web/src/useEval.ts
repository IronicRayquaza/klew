import { useEffect, useState } from 'react'
import { api, snapshot, type EvalResult } from './api'
import type { LearningCurveData } from './components/LearningCurve'

export function useEvalResults() {
  const [results, setResults] = useState<EvalResult[] | null>(null)
  const [learning, setLearning] = useState<LearningCurveData[]>([])
  const [source, setSource] = useState<'live' | 'snapshot'>('snapshot')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const list = await api.evalList()
        const full = await Promise.all(list.map((e) => api.evalOne(e.name)))
        const lc = await api.learning().catch(() => [] as LearningCurveData[])
        if (alive) { setResults(full); setLearning(lc); setSource('live') }
      } catch {
        try {
          const names = await snapshot<string[]>('eval-index.json')
          const full = await Promise.all(names.map((n) => snapshot<EvalResult>(`eval-${n}.json`)))
          const lc = await snapshot<LearningCurveData[]>('learning.json').catch(() => [] as LearningCurveData[])
          if (alive) { setResults(full); setLearning(lc); setSource('snapshot') }
        } catch (e) {
          if (alive) setError(String(e))
        }
      }
    })()
    return () => { alive = false }
  }, [])
  return { results, learning, source, error }
}
