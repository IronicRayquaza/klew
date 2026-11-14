import { useEffect, useState } from 'react'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Results from './pages/Results'
import { Logo } from './components/Logo'

const ROUTES = { '': 'Overview', app: 'Try it', results: 'Results' } as const
type Route = keyof typeof ROUTES

function useRoute(): Route {
  const read = () => (location.hash.replace('#', '') as Route) in ROUTES ? (location.hash.replace('#', '') as Route) : ''
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export default function App() {
  const route = useRoute()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <a href="#" className="flex items-center gap-2 font-display text-lg font-bold text-ink no-underline">
            <Logo /> Desirepath
          </a>
          <div className="ml-auto flex items-center gap-1 text-sm">
            {(Object.keys(ROUTES) as Route[]).map((r) => (
              <a key={r} href={`#${r}`}
                 className={`rounded-md px-3 py-1.5 no-underline transition-colors ${route === r ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
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
      </main>
      <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted sm:px-6">
        Built on <a className="text-ink" href="https://github.com/hydra-db/hydradb">HydraDB</a> for the HydraDB Hackathon, November 2026. MIT licensed.
      </footer>
    </div>
  )
}
