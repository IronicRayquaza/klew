import { useEffect, useState } from "react";
import { Wordmark } from "./components/Logo";
import { Dashboard } from "./pages/Dashboard";
import { Docs } from "./pages/Docs";
import { Landing } from "./pages/Landing";
import { Results } from "./pages/Results";

type Tab = "landing" | "app" | "results" | "docs";

function parseHash(h: string): { tab: Tab; sub?: string } {
  const s = h.replace(/^#\/?/, "");
  if (s === "app" || s.startsWith("app?") || s === "playground") return { tab: "app" };
  if (s === "results" || s === "evidence") return { tab: "results" };
  if (s === "docs" || s.startsWith("docs/")) {
    return { tab: "docs", sub: s.slice(5) || undefined };
  }
  return { tab: "landing" };
}

export default function App() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [copiedFooterCmd, setCopiedFooterCmd] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (t: Tab, sub?: string) => {
    window.location.hash =
      t === "landing" ? "" : t === "docs" ? (sub ? `docs/${sub}` : "docs") : t;
    setRoute({ tab: t, sub });
  };

  const tab = route.tab;
  const isPlayground = tab === "app";

  const copyInstallCmd = () => {
    navigator.clipboard?.writeText("pip install klew && klew hydra up");
    setCopiedFooterCmd(true);
    window.setTimeout(() => setCopiedFooterCmd(false), 1800);
  };

  return (
    <div
      className={`flex w-full max-w-full flex-col bg-paper text-ink ${
        isPlayground ? "h-screen overflow-hidden" : "min-h-screen overflow-x-clip"
      }`}
    >
      {/* Soft, Breathable Top Navigation */}
      <header
        className={`sticky top-0 z-40 w-full transition-colors ${
          isPlayground
            ? "border-b border-line/70 bg-card/90 backdrop-blur-md px-5 sm:px-8"
            : "bg-paper/85 backdrop-blur-md px-frame"
        }`}
      >
        <div className="flex h-17 w-full items-center justify-between gap-4">
          {/* Brand Wordmark */}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              go("landing");
            }}
            className="flex shrink-0 items-center gap-2.5 focus:outline-none"
          >
            <Wordmark size="md" showPronunciation />
          </a>

          {/* Center Pill Navigation (Overview, Evidence, Docs only - Playground is the right CTA) */}
          <nav
            className="flex items-center gap-1 rounded-full border border-line bg-card/90 p-1 shadow-xs"
            aria-label="Main navigation"
          >
            {(
              [
                ["landing", "Overview"],
                ["results", "Evidence"],
                ["docs", "Docs"],
              ] as const
            ).map(([k, label]) => {
              const active = tab === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => go(k)}
                  className={`btn-soft rounded-full px-4 py-1.5 text-xs font-medium sm:px-5 sm:text-sm ${
                    active
                      ? "bg-ink text-paper shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Right Playground CTA */}
          <div className="flex items-center gap-2.5">
            {!isPlayground ? (
              <button
                type="button"
                onClick={() => go("app")}
                className="btn-soft inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper shadow-xs hover:opacity-90 sm:px-5"
              >
                <span>Open Playground</span>
                <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => go("landing")}
                className="btn-soft inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-1.5 font-mono text-xs font-medium text-ink hover:bg-paper"
              >
                <span aria-hidden="true">←</span>
                <span>Overview</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={isPlayground ? "relative w-full flex-1 overflow-hidden" : "w-full flex-1"}>
        {tab === "landing" && (
          <Landing
            onTry={() => go("app")}
            onResults={() => go("results")}
            onDocs={(s) => go("docs", s)}
          />
        )}
        {tab === "app" && <Dashboard />}
        {tab === "results" && <Results onTry={() => go("app")} />}
        {tab === "docs" && <Docs slug={route.sub} onNavigate={(s) => go("docs", s)} />}
      </main>

      {/* Soft Architectural Card Footer (hidden on fullscreen Playground) */}
      {!isPlayground && (
        <footer className="mt-24 w-full px-frame pb-12">
          <div className="surface-card overflow-hidden p-8 sm:p-12 lg:p-14">
            {/* Top Callout Strip */}
            <div className="flex flex-col justify-between gap-6 border-b border-line pb-10 lg:flex-row lg:items-center">
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-muted">
                  Ariadne&apos;s Thread for Coding Agents
                </div>
                <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  Ready to unwind your codebase graph?
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={copyInstallCmd}
                  className="btn-soft inline-flex items-center gap-3 rounded-full border border-line bg-paper px-4 py-2.5 font-mono text-xs text-ink hover:border-ink/40"
                  title="Copy install command"
                >
                  <span>$ pip install klew &amp;&amp; klew hydra up</span>
                  <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-medium text-muted">
                    {copiedFooterCmd ? "Copied" : "Copy"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => go("app")}
                  className="btn-soft inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-paper hover:opacity-90"
                >
                  <span>Open Playground</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>

            {/* Middle Directory Columns */}
            <div className="grid grid-cols-1 gap-10 py-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <Wordmark size="md" showPronunciation />
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
                  From Middle English <span className="font-medium text-ink">clew</span> - the ball of thread
                  Ariadne gave Theseus to navigate the Labyrinth, and the origin of the word{" "}
                  <span className="font-medium text-ink">clue</span>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
                    Navigation
                  </div>
                  <ul className="mt-3.5 space-y-2.5 text-sm text-ink-soft">
                    <li>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          go("landing");
                        }}
                        className="hover:text-ink"
                      >
                        Overview
                      </a>
                    </li>
                    <li>
                      <a
                        href="#app"
                        onClick={(e) => {
                          e.preventDefault();
                          go("app");
                        }}
                        className="hover:text-ink"
                      >
                        Graph Playground
                      </a>
                    </li>
                    <li>
                      <a
                        href="#results"
                        onClick={(e) => {
                          e.preventDefault();
                          go("results");
                        }}
                        className="hover:text-ink"
                      >
                        Held-Out Evidence
                      </a>
                    </li>
                    <li>
                      <a
                        href="#docs"
                        onClick={(e) => {
                          e.preventDefault();
                          go("docs");
                        }}
                        className="hover:text-ink"
                      >
                        Documentation
                      </a>
                    </li>
                  </ul>
                </div>

                <div>
                  <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
                    Interfaces
                  </div>
                  <ul className="mt-3.5 space-y-2.5 font-mono text-xs text-ink-soft">
                    <li>
                      <a
                        href="#docs/quickstart"
                        onClick={(e) => {
                          e.preventDefault();
                          go("docs", "quickstart");
                        }}
                        className="hover:text-ink"
                      >
                        Quickstart CLI
                      </a>
                    </li>
                    <li>
                      <a
                        href="#docs/mcp"
                        onClick={(e) => {
                          e.preventDefault();
                          go("docs", "mcp");
                        }}
                        className="hover:text-ink"
                      >
                        MCP Server
                      </a>
                    </li>
                    <li>
                      <a
                        href="#docs/github-action"
                        onClick={(e) => {
                          e.preventDefault();
                          go("docs", "github-action");
                        }}
                        className="hover:text-ink"
                      >
                        GitHub Action
                      </a>
                    </li>
                    <li>
                      <a
                        href="#docs/architecture"
                        onClick={(e) => {
                          e.preventDefault();
                          go("docs", "architecture");
                        }}
                        className="hover:text-ink"
                      >
                        HydraDB Schema
                      </a>
                    </li>
                  </ul>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
                    Graph Engine
                  </div>
                  <p className="mt-3.5 text-sm leading-relaxed text-muted">
                    Self-hosted on open-source{" "}
                    <a
                      href="https://github.com/hydra-db/hydradb"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
                    >
                      HydraDB
                    </a>{" "}
                    over Bolt.
                  </p>
                  <div className="mt-3 inline-block rounded-full border border-line bg-paper px-3 py-1 font-mono text-[11px] text-muted">
                    Apache-2.0 License
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Meta Row */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 font-mono text-xs text-muted">
              <span>Klew · Graph Context Server for Coding Agents</span>
              <span>Zero vector lock-in · Deterministic why-paths</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
