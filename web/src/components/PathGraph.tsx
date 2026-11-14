import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ContextPack } from '../api'

type N = { id: string; label: string; kind: 'seed' | 'file' | 'symbol'; score: number }
type L = { source: string; target: string; via: string }

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}

export function PathGraph({ pack, height = 360 }: { pack: ContextPack; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo(() => {
    const nodes = new Map<string, N>()
    const links = new Map<string, L>()
    for (const it of pack.items) {
      let prev: string | null = null
      it.why.forEach((s, i) => {
        const id = String(s.node_id)
        const kind: N['kind'] = i === 0 ? 'seed' : s.node.endsWith('.py') ? 'file' : 'symbol'
        const cur = nodes.get(id)
        if (!cur || kind === 'seed') nodes.set(id, { id, label: s.node, kind, score: cur?.score ?? 0 })
        if (prev) links.set(`${prev}>${id}`, { source: prev, target: id, via: s.via ?? '' })
        prev = id
      })
      const f = nodes.get(String(it.file_id))
      if (f) f.score = it.score
      else nodes.set(String(it.file_id), { id: String(it.file_id), label: it.path, kind: 'file', score: it.score })
    }
    return { nodes: [...nodes.values()], links: [...links.values()] }
  }, [pack])

  const colors = { seed: css('--trail'), file: css('--moss'), symbol: css('--sky'), line: css('--line'), ink: css('--ink'), muted: css('--muted') }
  return (
    <div ref={wrap} className="overflow-hidden rounded-xl border border-line bg-card" style={{ height }}>
      <ForceGraph2D
        width={width} height={height} graphData={data} cooldownTicks={80}
        backgroundColor="rgba(0,0,0,0)"
        linkColor={() => colors.line} linkWidth={1.4}
        linkDirectionalArrowLength={4} linkDirectionalArrowRelPos={0.9}
        nodeRelSize={4}
        nodeCanvasObject={(node, ctx, scale) => {
          const n = node as N & { x: number; y: number }
          const r = n.kind === 'file' ? 5 + Math.min(6, Math.sqrt(n.score)) : 4
          ctx.beginPath()
          ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
          ctx.fillStyle = colors[n.kind]
          ctx.fill()
          const label = n.kind === 'file' ? n.label : n.label.split('.').slice(-2).join('.')
          const fs = Math.max(10 / scale, 3)
          ctx.font = `${fs}px "JetBrains Mono", monospace`
          ctx.fillStyle = n.kind === 'file' ? colors.ink : colors.muted
          ctx.textAlign = 'center'
          ctx.fillText(label, n.x, n.y + r + fs + 1)
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as N & { x: number; y: number }
          ctx.fillStyle = color
          ctx.beginPath(); ctx.arc(n.x, n.y, 8, 0, 2 * Math.PI); ctx.fill()
        }}
        nodeLabel={(n) => (n as N).label}
      />
    </div>
  )
}
