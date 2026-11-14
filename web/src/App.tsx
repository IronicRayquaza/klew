import { useEffect, useState } from 'react'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Results from './pages/Results'
import Docs from './pages/Docs'
import { Logo } from './components/Logo'

const ROUTES = { '': 'Overview', app: 'Try it', results: 'Results', docs: 'Docs' } as const
type Route = keyof typeof ROUTES

function parse(): { route: Route; sub: string } {
  const [head, ...rest] = location.hash.replace('#', '').split('/')
  return { route: (head in ROUTES ? head : '') as Route, sub: rest.join('/') }
}

function useRoute() {
  const read = parse
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export default function App() {
  const { route, sub } = useRoute()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
          <a href="#" className="flex items-center gap-2 font-display text-lg font-bold text-ink no-underline">
            <Logo /> <span className="hidden sm:inline">Klew</span>
          </a>
          <div className="ml-auto flex items-center gap-0.5 text-sm sm:gap-1">
            {(Object.keys(ROUTES) as Route[]).map((r) => (
              <a key={r} href={`#${r}`}
                 className={`rounded-md px-2 py-1.5 no-underline transition-colors sm:px-3 ${route === r ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
                {ROUTES[r]}
              </a>
            ))}
          </div>
        </nav>
      </header>
      <main>
        {route === '' && <Landing />}
        {route === 'app' && <Dashboard />}
        {route === 'results' && <Results />}
        {route === 'docs' && <Docs slug={sub} />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted sm:px-6">
        Built on <a className="text-ink" href="https://github.com/hydra-db/hydradb">HydraDB</a> for the HydraDB Hackathon, November 2026. MIT licensed.
      </footer>
    </div>
  )
}
