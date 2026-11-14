import { useEffect, useMemo, useRef } from 'react'
import { marked } from 'marked'
import overview from '../docs/overview.md?raw'
import quickstart from '../docs/quickstart.md?raw'
import mcp from '../docs/mcp.md?raw'
import cli from '../docs/cli.md?raw'
import api from '../docs/api.md?raw'
import action from '../docs/github-action.md?raw'
import library from '../docs/library.md?raw'
import concepts from '../docs/concepts.md?raw'
import architecture from '../docs/architecture.md?raw'
import evaluation from '../docs/evaluation.md?raw'
import integrations from '../docs/integrations.md?raw'
import faq from '../docs/faq.md?raw'

type Page = { slug: string; title: string; md: string }
const GROUPS: { name: string; pages: Page[] }[] = [
  { name: 'Get started', pages: [
    { slug: 'overview', title: 'Overview', md: overview },
    { slug: 'quickstart', title: 'Quickstart', md: quickstart },
  ] },
  { name: 'Use it', pages: [
    { slug: 'mcp', title: 'MCP server', md: mcp },
    { slug: 'cli', title: 'CLI reference', md: cli },
    { slug: 'api', title: 'REST API', md: api },
    { slug: 'github-action', title: 'GitHub Action', md: action },
    { slug: 'library', title: 'Python library', md: library },
  ] },
  { name: 'Understand it', pages: [
    { slug: 'concepts', title: 'How it works', md: concepts },
    { slug: 'architecture', title: 'Architecture', md: architecture },
    { slug: 'evaluation', title: 'Evaluation', md: evaluation },
  ] },
  { name: 'Product', pages: [
    { slug: 'integrations', title: 'Integrations and plans', md: integrations },
    { slug: 'faq', title: 'FAQ', md: faq },
  ] },
]
const ALL = GROUPS.flatMap((g) => g.pages)

export default function Docs({ slug }: { slug: string }) {
  const page = ALL.find((p) => p.slug === slug) ?? ALL[0]
  const idx = ALL.indexOf(page)
  const html = useMemo(() => marked.parse(page.md, { async: false }) as string, [page])
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = body.current
    if (!root) return
    root.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('button')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = 'Copy'
      btn.className = 'copy-btn'
      btn.addEventListener('click', () => {
        const text = pre.querySelector('code')?.textContent ?? ''
        navigator.clipboard.writeText(text).then(
          () => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1500) },
          () => { btn.textContent = 'Select and copy' },
        )
      })
      pre.appendChild(btn)
    })
  }, [html])

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Documentation" className="lg:sticky lg:top-20 lg:self-start">
        <div className="flex gap-6 overflow-x-auto pb-2 lg:grid lg:gap-6 lg:overflow-visible">
          {GROUPS.map((g) => (
            <div key={g.name} className="grid shrink-0 content-start gap-1">
              <span className="eyebrow mb-1">{g.name}</span>
              {g.pages.map((p) => (
                <a key={p.slug} href={`#docs/${p.slug}`}
                   className={`rounded-md px-2 py-1 text-sm whitespace-nowrap no-underline ${p.slug === page.slug ? 'bg-card font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                  {p.title}
                </a>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <article className="grid min-w-0 content-start gap-10">
        <div ref={body} className="doc" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-6 text-sm">
          {idx > 0 ? <a href={`#docs/${ALL[idx - 1].slug}`} className="text-muted no-underline hover:text-ink">← {ALL[idx - 1].title}</a> : <span />}
          {idx < ALL.length - 1 && <a href={`#docs/${ALL[idx + 1].slug}`} className="text-ink no-underline">{ALL[idx + 1].title} →</a>}
        </div>
      </article>
    </div>
  )
}
