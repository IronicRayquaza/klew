import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ARM_COLOR, ARM_LABEL, type EvalResult } from '../api'

type Metric = 'budget_recall' | 'recall@5'

export function Curve({ result, metric, arms, height = 300 }: {
  result: EvalResult; metric: Metric; arms?: string[]; height?: number
}) {
  const show = (arms ?? result.arms).filter((a) => result.curves[a])
  const n = result.curves[show[0]]?.[metric].length ?? 0
  const skip = Math.min(20, Math.floor(n / 10))   // the first points average too few commits
  const data = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number> = { i: i + 1 }
    for (const a of show) row[a] = result.curves[a][metric][i]
    return row
  }).slice(skip)
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="i" tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }}
                 label={{ value: 'commits replayed', position: 'insideBottomRight', offset: -2, fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis domain={[0.3, 0.9]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fill: 'var(--muted)', fontSize: 12 }}
                 tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' }}
                   formatter={(v: number, k: string) => [`${(v * 100).toFixed(1)}%`, ARM_LABEL[k] ?? k]}
                   labelFormatter={(l) => `after ${l} commits (trailing 50)`} />
          <Legend formatter={(k: string) => <span style={{ color: 'var(--ink)' }}>{ARM_LABEL[k] ?? k}</span>} />
          {show.map((a) => (
            <Line key={a} type="monotone" dataKey={a} dot={false} isAnimationActive={false}
                  stroke={ARM_COLOR[a]} strokeWidth={a.startsWith('graph_learn') || a === 'graph_hybrid' ? 2.6 : 1.6} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
