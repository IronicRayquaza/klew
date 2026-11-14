import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type LearningPoint = { learned: number; learning: boolean; budget_recall: number; 'recall@5': number; 'hit@1': number; mrr: number }
export type LearningCurveData = { repo: string; held_out_commits: number; tuned_on_first: number; points: LearningPoint[] }

const SERIES: [keyof LearningPoint, string, string][] = [
  ['budget_recall', 'Right file in context', 'var(--trail)'],
  ['recall@5', 'Recall@5', 'var(--sky)'],
  ['hit@1', 'Top-1', 'var(--moss)'],
]

export function LearningCurve({ data, height = 260 }: { data: LearningCurveData; height?: number }) {
  const base = data.points.find((p) => !p.learning)
  const pts = data.points
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={pts} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="learned" type="number" domain={[0, 'dataMax']} ticks={pts.map((p) => p.learned)}
                 tick={{ fill: 'var(--muted)', fontSize: 12 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }}
                 label={{ value: 'past commits learned', position: 'insideBottomRight', offset: -4, fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis domain={[0.3, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fill: 'var(--muted)', fontSize: 12 }}
                 tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' }}
                   formatter={(v: number, k: string) => [`${(v * 100).toFixed(1)}%`, SERIES.find((s) => s[0] === k)?.[1] ?? k]}
                   labelFormatter={(l) => `after learning from ${l} past commits`} />
          <Legend formatter={(k: string) => <span style={{ color: 'var(--ink)' }}>{SERIES.find((s) => s[0] === k)?.[1] ?? k}</span>} />
          {base && SERIES.map(([k, , c]) => (
            <ReferenceLine key={`b-${String(k)}`} y={base[k] as number} stroke={c} strokeDasharray="3 4" strokeOpacity={0.7} />
          ))}
          {SERIES.map(([k, , c]) => (
            <Line key={String(k)} type="monotone" dataKey={k as string} stroke={c} strokeWidth={2.4} dot={{ r: 3 }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
