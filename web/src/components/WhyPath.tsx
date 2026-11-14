import type { PathStep } from '../api'

function short(node: string) {
  if (node.endsWith('.py')) return node
  const parts = node.split('.')
  return parts.slice(-2).join('.')
}

export function WhyPath({ steps, reason }: { steps: PathStep[]; reason?: string }) {
  if (!steps.length) return null
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[0.78rem] leading-6">
      {steps.map((s, i) => (
        <span key={`${s.node_id}-${i}`} className="flex items-center gap-1.5">
          {s.via && <span className="text-muted">{s.via} →</span>}
          <span className={`rounded px-1.5 py-0.5 break-all ${i === 0 ? 'bg-trail/15 text-trail' : s.node.endsWith('.py') ? 'bg-moss/15 text-moss' : 'bg-code text-ink'}`}
                title={s.node}>
            {short(s.node)}
          </span>
        </span>
      ))}
      {reason && <span className="basis-full text-muted">seed: {reason}</span>}
    </div>
  )
}
