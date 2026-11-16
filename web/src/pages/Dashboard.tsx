import { useEffect, useRef, useState } from "react";
import {
  api,
  backendUp,
  snapshot,
  type ContextPack,
  type GraphStats,
  type LearnReport,
  type Repo,
} from "../api";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconPlus,
  IconX,
} from "../components/Icons";
import { PathGraph } from "../components/PathGraph";
import { WhyPath, WhyPathCompact } from "../components/WhyPath";
import { WaitlistModal } from "../components/WaitlistModal";
import { startPlaygroundTour } from "../components/playgroundTour";
import type { Driver } from "driver.js";

const EXAMPLES = [
  {
    short: "NO_PROXY CIDR ranges",
    full: "Support NO_PROXY environment variable with CIDR ranges",
  },
  {
    short: "ReadTimeout on stream stall",
    full: "Raise ReadTimeout when the server stalls while streaming the response body",
  },
  {
    short: "Client.send redirect auth",
    full: "Client.send should not follow redirects to another origin with auth headers",
  },
];

type ActiveModal = "files" | "learn" | "settings" | null;

export function Dashboard() {
  const [live, setLive] = useState<boolean | null>(null);
  const [demo, setDemo] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState("httpx");
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [task, setTask] = useState(EXAMPLES[0].full);
  const [budget, setBudget] = useState(2000);
  const [pack, setPack] = useState<ContextPack | null>(null);
  const [snapshotPacks, setSnapshotPacks] = useState<ContextPack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [report, setReport] = useState<LearnReport | null>(null);

  // Playground UI state: center modal vs right-corner collapsed inspector
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // On phones the inspector would cover the graph, so it starts collapsed there (dock button reopens it).
  const [cornerOpen, setCornerOpen] = useState<boolean>(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 640px)").matches,
  );
  const [showSnippet, setShowSnippet] = useState<boolean>(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const tourRef = useRef<Driver | null>(null);
  const demoRef = useRef(false);
  demoRef.current = demo;

  // The Playground manual: starts every time the Playground opens; Skip on every step, "?" in the dock replays it.
  const startTour = () => {
    tourRef.current?.destroy();
    setWaitlistOpen(false);
    tourRef.current = startPlaygroundTour({ setModal: setActiveModal, setInspector: setCornerOpen, demo: demoRef.current });
  };
  useEffect(() => {
    const t = window.setTimeout(startTour, 900);
    return () => {
      window.clearTimeout(t);
      tourRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    (async () => {
      const up = await backendUp();
      setLive(up);
      if (up) api.health().then((h) => setDemo(!!h.demo)).catch(() => {});
      if (up) {
        const rs = await api.repos().catch(() => []);
        setRepos(rs);
        // The example tasks are httpx tasks, so start there when it is indexed.
        const defaultRepo = rs.find((r) => r.repo === "httpx")?.repo ?? rs[0]?.repo ?? "httpx";
        setRepo(defaultRepo);
        try {
          const p = await api.context(defaultRepo, EXAMPLES[0].full, 2000);
          setPack(p);
          setSelectedFile(p.items[0]?.path ?? null);
        } catch {
          // ignore
        }
      } else {
        const packs = await snapshot<ContextPack[]>("packs.json").catch(() => []);
        setSnapshotPacks(packs);
        if (packs[0]) {
          setPack(packs[0]);
          setTask(packs[0].task);
          setRepo(packs[0].repo);
          setSelectedFile(packs[0].items[0]?.path ?? null);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (live && repo) {
      api
        .stats(repo)
        .then(setStats)
        .catch(() => setStats(null));
    }
  }, [live, repo, report]);

  async function runQuery(nextTask = task, nextBudget = budget) {
    setBusy(true);
    setError(null);
    setReport(null);
    setTouched(new Set());
    try {
      if (live) {
        const res = await api.context(repo, nextTask, nextBudget);
        setPack(res);
        setSelectedFile(res.items[0]?.path ?? null);
        setCornerOpen(window.matchMedia("(min-width: 640px)").matches);
      } else if (snapshotPacks.length) {
        // Offline: only recorded packs exist. Show the closest one exactly as recorded and say so;
        // never relabel it with the typed task or re-pack it for a different budget.
        const q = nextTask.toLowerCase();
        const found =
          snapshotPacks.find((p) => p.task.toLowerCase() === q) ||
          snapshotPacks.find((p) =>
            q.includes("timeout") || q.includes("stall")
              ? p.task.includes("ReadTimeout")
              : q.includes("redirect") || q.includes("send")
                ? p.task.includes("Client.send")
                : p.task.includes("NO_PROXY"),
          ) ||
          snapshotPacks[0];
        if (found.task.toLowerCase() !== q) {
          setError(
            `Offline: only recorded runs are available, so this shows the recorded pack for "${found.task}". Start \`klew serve\` to ask your own task.`,
          );
        }
        setTask(found.task);
        setBudget(found.budget_tokens);
        setPack(found);
        setSelectedFile(found.items[0]?.path ?? null);
        setCornerOpen(window.matchMedia("(min-width: 640px)").matches);
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function teach() {
    if (!pack) return;
    const files = [...touched, ...extra.split(/[\s,]+/).filter(Boolean)];
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      if (live) {
        const rep = await api.outcome(repo, pack.run_id, files);
        setReport(rep);
        const refreshed = await api.context(repo, pack.task, budget);
        setPack(refreshed);
      } else {
        setError("Teaching writes to the graph, so it needs the live API. Start `klew serve` and reload.");
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const toggleTouch = (p: string) =>
    setTouched((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  // Selecting a file from the center modal collapses the modal into the top-right corner drawer
  // so the user can watch the relationship graph update in real time.
  const handleSelectFileAndCollapseToCorner = (path: string) => {
    if (!path) {
      setSelectedFile(null);
      return;
    }
    setSelectedFile(path);
    setActiveModal(null);
    setCornerOpen(true);
  };

  const activeItemIdx = pack?.items.findIndex((i) => i.path === selectedFile) ?? -1;
  const activeItem =
    activeItemIdx >= 0 && pack ? pack.items[activeItemIdx] : pack?.items[0] ?? null;

  const stepFile = (delta: number) => {
    if (!pack || !pack.items.length) return;
    const base = activeItemIdx >= 0 ? activeItemIdx : 0;
    const nextIdx = (base + delta + pack.items.length) % pack.items.length;
    setSelectedFile(pack.items[nextIdx].path);
    setCornerOpen(true);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* =====================================================================
          1. FULL-VIEWPORT RELATIONSHIP GRAPH CANVAS
         ===================================================================== */}
      {pack ? (
        <PathGraph
          pack={pack}
          focusFile={selectedFile}
          onSelectFile={handleSelectFileAndCollapseToCorner}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-playground-dots font-mono text-sm text-muted">
          Unwinding code graph…
        </div>
      )}

      {/* =====================================================================
          2. DETACHABLE LEFT ICON SIDEBAR DOCK
         ===================================================================== */}
      <aside
        className="surface-glass absolute top-1/2 left-5 z-20 flex -translate-y-1/2 flex-col items-center gap-2 rounded-3xl p-2"
        aria-label="Playground tools"
        data-tour="dock"
      >
        {/* Files Modal Trigger */}
        <DockIconButton
          active={activeModal === "files"}
          onClick={() => setActiveModal(activeModal === "files" ? null : "files")}
          label="Context Files"
          badge={pack?.items.length}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
        </DockIconButton>

        {/* Teach / Continual Learning Modal Trigger */}
        <DockIconButton
          active={activeModal === "learn"}
          onClick={() => setActiveModal(activeModal === "learn" ? null : "learn")}
          label="Teach Graph (Record Outcome)"
          badge={touched.size > 0 ? touched.size : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
            <path d="M8.5 8.5c4 4 3 7 7 7" />
            <path d="M15 6h3v3" />
          </svg>
        </DockIconButton>

        {/* Budget & Repository Settings Modal Trigger */}
        <DockIconButton
          active={activeModal === "settings"}
          onClick={() => setActiveModal(activeModal === "settings" ? null : "settings")}
          label="Budget & Graph Telemetry"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
        </DockIconButton>

        <div className="my-0.5 h-px w-6 bg-line" />

        {/* Toggle Corner File Inspector */}
        <DockIconButton
          active={cornerOpen && !activeModal}
          onClick={() => {
            if (activeModal) setActiveModal(null);
            setCornerOpen((v) => !v);
          }}
          label={cornerOpen ? "Hide Corner Inspector" : "Show Corner Inspector"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="M14 3v18" />
          </svg>
        </DockIconButton>

        <div className="my-0.5 h-px w-6 bg-line" />

        {/* Use your own repo -> waitlist */}
        <DockIconButton active={waitlistOpen} onClick={() => setWaitlistOpen(true)} label="Use your repo" tour="byo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="2.5" />
            <circle cx="6" cy="18" r="2.5" />
            <path d="M6 8.5v7" />
            <path d="M18 9v6" />
            <path d="M15 12h6" />
          </svg>
        </DockIconButton>

        {/* Replay the Playground guide */}
        <DockIconButton onClick={startTour} label="Playground guide" tour="help">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" />
            <circle cx="12" cy="17.2" r="0.6" fill="currentColor" />
          </svg>
        </DockIconButton>
      </aside>

      {/* =====================================================================
          3. RIGHT-CORNER COLLAPSIBLE FILE INSPECTOR DRAWER
         ===================================================================== */}
      {pack && activeItem && cornerOpen && !activeModal && (
        <div data-tour="inspector" className="surface-glass animate-drawer-in absolute top-5 right-5 z-20 flex max-h-[calc(100dvh-13rem)] w-[min(410px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl p-5">
          {/* Top Navigation Bar inside Corner Card */}
          <div data-tour="inspector-nav" className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stepFile(-1)}
                className="btn-soft flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-xs text-ink hover:bg-paper"
                title="Previous file in pack"
              >
                <IconArrowLeft size={13} />
              </button>
              <span className="num rounded-full border border-line bg-paper px-2.5 py-0.5 font-mono text-[11px] font-medium text-ink">
                #{activeItemIdx >= 0 ? activeItemIdx + 1 : 1} of {pack.items.length}
              </span>
              <button
                type="button"
                onClick={() => stepFile(1)}
                className="btn-soft flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-xs text-ink hover:bg-paper"
                title="Next file in pack"
              >
                <IconArrowRight size={13} />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveModal("files")}
                className="btn-soft rounded-full border border-line bg-card px-3 py-1 font-mono text-[11px] text-muted hover:text-ink"
              >
                All files
              </button>
              <button
                type="button"
                onClick={() => setCornerOpen(false)}
                className="btn-soft flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-xs text-muted hover:text-ink"
                title="Minimize inspector"
              >
                <IconX size={13} />
              </button>
            </div>
          </div>

          {/* File title + meta */}
          <div data-tour="inspector-meta" className="mt-4 grid gap-1">
            <h3 className="truncate font-mono text-sm font-semibold text-ink" title={activeItem.path}>
              {activeItem.path}
            </h3>
            <p className="num font-mono text-[11px] text-muted">
              score {activeItem.score.toFixed(2)} · {activeItem.tokens.toLocaleString()} tok
              {activeItem.symbols.length > 0 &&
                ` · ${activeItem.symbols.length} symbol${activeItem.symbols.length > 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Why it is in the pack: evidence, then the thread (same shape for every file) */}
          <div className="mt-3 min-h-0 overflow-y-auto rounded-2xl border border-line/80 bg-paper/60 p-3.5">
            <WhyPath steps={activeItem.why} reason={activeItem.seed_reason} path={activeItem.path} />
          </div>

          {/* Action Row: Mark as Changed + Toggle Snippet */}
          <div data-tour="inspector-actions" className="mt-3.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => toggleTouch(activeItem.path)}
              className={`btn-soft inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-xs font-medium ${
                touched.has(activeItem.path)
                  ? "bg-ink text-paper"
                  : "border border-line bg-card text-ink hover:bg-paper"
              }`}
            >
              {touched.has(activeItem.path) ? <IconCheck size={12} /> : <IconPlus size={12} />}
              <span>{touched.has(activeItem.path) ? "Marked as changed" : "Mark as changed"}</span>
            </button>

            {activeItem.snippet && (
              <button
                type="button"
                onClick={() => setShowSnippet((v) => !v)}
                className="btn-soft rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs text-ink hover:bg-paper"
              >
                {showSnippet ? "Hide code" : "View code"}
              </button>
            )}
          </div>

          {/* Optional Expandable Code Snippet */}
          {showSnippet && activeItem.snippet && (
            <pre className="mt-3 max-h-48 overflow-auto rounded-2xl border border-line bg-paper p-3.5 font-mono text-[11px] leading-relaxed text-ink select-text">
              {activeItem.snippet}
            </pre>
          )}
        </div>
      )}

      {/* =====================================================================
          4. WIDER CENTER MODALS (FILES, TEACH / LEARN, SETTINGS)
         ===================================================================== */}
      {activeModal && pack && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-ink/15 p-4 backdrop-blur-xs"
          onClick={() => setActiveModal(null)}
        >
          {/* MODAL A: CONTEXT FILES MODAL (wider max-w-4xl) */}
          {activeModal === "files" && (
            <div
              onClick={(e) => e.stopPropagation()}
              data-tour="files-modal"
              className="surface-card animate-modal-in flex max-h-[80vh] w-[min(92vw,56rem)] flex-col overflow-hidden p-6 sm:p-8"
            >
              <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider text-muted">
                    Context Pack · {pack.tokens.toLocaleString()} / {pack.budget_tokens.toLocaleString()} tok
                  </span>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
                    Packed Files ({pack.items.length})
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    Click any file to collapse this modal into the corner and inspect its thread on the graph.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="btn-soft flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper text-sm text-muted hover:text-ink"
                >
                  <IconX size={14} />
                </button>
              </div>

              <div className="mt-5 grid flex-1 grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {pack.items.map((it, idx) => {
                  const isSel = selectedFile === it.path;
                  const isTouch = touched.has(it.path);
                  return (
                    <div
                      key={it.file_id}
                      onClick={() => handleSelectFileAndCollapseToCorner(it.path)}
                      className={`cursor-pointer rounded-2xl border p-4 transition-[background-color,border-color] duration-200 ${
                        isSel
                          ? "border-ink bg-paper"
                          : "border-line bg-paper/55 hover:border-ink/40 hover:bg-card"
                      }`}
                    >
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
                        <span className="num flex h-6 min-w-6 items-center justify-center rounded-full border border-line bg-card px-1.5 font-mono text-[11px] font-semibold text-ink">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[13px] font-semibold text-ink" title={it.path}>
                            {it.path}
                          </div>
                          <div className="num font-mono text-[11px] text-muted">
                            score {it.score.toFixed(2)} · {it.tokens.toLocaleString()} tok
                          </div>
                        </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTouch(it.path);
                            }}
                            className={`btn-soft inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] ${
                              isTouch
                                ? "bg-ink font-medium text-paper"
                                : "border border-line bg-card text-muted hover:text-ink"
                            }`}
                          >
                            {isTouch ? <IconCheck size={10} /> : <IconPlus size={10} />}
                            <span>Changed</span>
                          </button>
                      </div>

                      <div className="mt-3 border-t border-line/70 pt-3">
                        <WhyPathCompact steps={it.why} reason={it.seed_reason} path={it.path} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MODAL B: TEACH / CONTINUAL LEARNING MODAL (wider max-w-2xl) */}
          {activeModal === "learn" && (
            <div
              onClick={(e) => e.stopPropagation()}
              data-tour="teach-modal"
              className="surface-card animate-modal-in w-[min(92vw,42rem)] p-6 sm:p-8"
            >
              <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider text-muted">
                    Continual Learning · record_outcome
                  </span>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
                    Teach the graph what changed
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="btn-soft flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper text-sm text-muted hover:text-ink"
                >
                  <IconX size={14} />
                </button>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted">
                Select the files your PR actually modified. Klew reinforces{" "}
                <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs text-ink">POINTS_TO</code> links
                from the task's words to those files, strengthens co-change links between them, and decays links to
                served files you did not touch.
                {!live && " Teaching needs the live API (klew serve)."}
              </p>

              <div className="mt-4 grid max-h-60 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {pack.items.slice(0, 10).map((it) => {
                  const checked = touched.has(it.path);
                  return (
                    <label
                      key={it.file_id}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-2.5 font-mono text-xs transition-colors ${
                        checked
                          ? "border-ink bg-paper font-medium text-ink"
                          : "border-line bg-paper/60 text-muted hover:text-ink"
                      }`}
                    >
                      <span className="truncate">{it.path}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTouch(it.path)}
                        className="accent-ink h-4 w-4"
                      />
                    </label>
                  );
                })}
              </div>

              <input
                placeholder="Additional touched files (comma-separated)…"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                className="mt-4 w-full rounded-xl border border-line bg-paper px-4 py-2.5 font-mono text-xs text-ink focus:border-ink focus:outline-none"
              />

              {report && (
                <div className="mt-4 rounded-2xl border border-line bg-paper p-3.5 font-mono text-xs text-ink">
                  +{report.edges_reinforced} reinforced · −{report.edges_decayed} decayed · +{report.edges_created} new
                  learned links
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="btn-soft rounded-full px-4 py-2 text-xs font-medium text-muted hover:text-ink"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={teach}
                  disabled={!live || (touched.size === 0 && !extra.trim()) || busy}
                  className="btn-soft inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-2.5 font-mono text-xs font-medium text-paper shadow-xs disabled:opacity-40"
                >
                  <span>{busy ? "Updating…" : `Reinforce Thread (${touched.size})`}</span>
                  {!busy && <IconArrowRight size={13} />}
                </button>
              </div>
            </div>
          )}

          {/* MODAL C: BUDGET & TELEMETRY SETTINGS MODAL (wider max-w-xl) */}
          {activeModal === "settings" && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="surface-card animate-modal-in w-[min(92vw,38rem)] p-6 sm:p-8"
            >
              <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
                <div>
                  <span className="font-mono text-xs uppercase tracking-wider text-muted">
                    Playground Configuration
                  </span>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
                    Budget &amp; Graph Stats
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="btn-soft flex h-8 w-8 items-center justify-center rounded-full border border-line bg-paper text-sm text-muted hover:text-ink"
                >
                  <IconX size={14} />
                </button>
              </div>

              <div className="mt-5 grid gap-4">
                {/* Repository: segmented picker, same pattern as the Evidence page */}
                <section data-tour="settings-repo" className="rounded-2xl border border-line bg-paper/70 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 id="repo-label" className="font-mono text-xs text-muted">
                      Repository graph
                    </h3>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
                      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-moss" : "bg-guide"}`} aria-hidden="true" />
                      {live ? "Live HydraDB" : "Recorded snapshot"}
                    </span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-labelledby="repo-label"
                    className="mt-3 flex flex-wrap gap-1 rounded-2xl border border-line bg-card p-1 sm:rounded-full"
                  >
                    {(repos.length ? repos.map((r) => r.repo) : [repo || "httpx"]).map((name) => {
                      const on = name === repo;
                      return (
                        <button
                          key={name}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={!live}
                          onClick={() => setRepo(name)}
                          className={`btn-soft min-w-20 flex-1 rounded-xl px-4 py-2 font-mono text-xs font-medium sm:rounded-full disabled:cursor-not-allowed ${
                            on ? "bg-ink text-paper shadow-xs" : "text-muted hover:text-ink"
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[11px] text-muted">
                      {live
                        ? "Your next query runs on the selected graph."
                        : "Run `klew serve` to query your own graphs."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal(null);
                        setWaitlistOpen(true);
                      }}
                      className="btn-soft inline-flex items-center gap-1 font-mono text-[11px] font-medium text-trail hover:text-ink"
                    >
                      <span>Use your own repo</span>
                      <IconArrowRight size={11} />
                    </button>
                  </div>
                </section>

                {/* Token budget */}
                <section data-tour="settings-budget" className="rounded-2xl border border-line bg-paper/70 p-5">
                  <div className="flex items-baseline justify-between font-mono text-xs">
                    <label htmlFor="budget" className="text-muted">
                      Context token budget
                    </label>
                    <span className="num font-semibold text-ink">{budget.toLocaleString()} tok</span>
                  </div>
                  <input
                    id="budget"
                    type="range"
                    min={500}
                    max={4000}
                    step={250}
                    value={budget}
                    disabled={!live}
                    onChange={(e) => {
                      const nextB = Number(e.target.value);
                      setBudget(nextB);
                      runQuery(task, nextB);
                    }}
                    className="klew-slider mt-3"
                  />
                  <div className="num mt-1.5 flex justify-between font-mono text-[10px] text-muted">
                    <span>500</span>
                    <span>2,000 (eval)</span>
                    <span>4,000</span>
                  </div>
                </section>

                {/* Graph + last query */}
                <div data-tour="settings-stats" className="grid grid-cols-3 gap-3 font-mono">
                  {[
                    [stats?.files != null ? stats.files.toLocaleString() : "–", "files", repo],
                    [stats ? stats.symbols.toLocaleString() : "–", "symbols", repo],
                    [`${pack.timings.total_ms.toFixed(0)} ms`, "last query", `${pack.timings.queries} queries`],
                  ].map(([v, k, sub]) => (
                    <div key={k} className="rounded-2xl border border-line bg-paper/60 px-3 py-3.5 text-center">
                      <div className="num text-base font-semibold text-ink">{v}</div>
                      <div className="mt-0.5 truncate text-[10px] text-muted">
                        {k} · {sub}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          5. BOTTOM-CENTER AGENT PROMPT INPUT BOX + EXAMPLE PILLS ABOVE IT
         ===================================================================== */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 mx-auto flex w-full max-w-3xl flex-col items-center gap-2.5 px-4">
        {demo && (
          <p className="pointer-events-auto max-w-2xl rounded-xl border border-line bg-card/95 px-4 py-2 text-center text-[11px] leading-relaxed text-muted shadow-sm">
            Shared public demo on a free server (a tenth of a CPU): each query takes several seconds, about 0.3 s on a
            laptop. The httpx and flask graphs start pre-trained on their history; what you teach here is shared with
            other visitors and resets when the server restarts.
          </p>
        )}

        {/* Example Task Pills floating above the prompt box */}
        <div data-tour="examples" className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5">
          {EXAMPLES.map((ex) => {
            const isCurrent = task === ex.full;
            return (
              <button
                key={ex.short}
                type="button"
                onClick={() => {
                  setTask(ex.full);
                  runQuery(ex.full, budget);
                }}
                className={`btn-soft rounded-full px-3.5 py-1.5 font-mono text-[11px] shadow-2xs transition-colors ${
                  isCurrent
                    ? "bg-ink font-medium text-paper"
                    : "surface-glass text-muted hover:text-ink"
                }`}
              >
                {ex.short}
              </button>
            );
          })}
        </div>

        {/* Agent Chat Input Box (looks like a true prompt composer, no dot circle) */}
        <div data-tour="task" className="pointer-events-auto w-full rounded-2xl border border-line bg-card/95 p-3 shadow-lg backdrop-blur-md">
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runQuery()}
            placeholder="Describe an issue or task for Klew to unwind through the repository graph…"
            className="w-full bg-transparent px-2 py-1 text-sm text-ink placeholder:text-muted focus:outline-none"
          />

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2.5 pl-1">
            <div data-tour="chips" className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted">
              <button
                type="button"
                onClick={() => setActiveModal("settings")}
                className="btn-soft rounded-lg border border-line bg-paper px-2.5 py-1 hover:text-ink"
                title="Change repository or token budget"
              >
                repo: {repo}
              </button>
              <button
                type="button"
                onClick={() => setActiveModal("settings")}
                className="btn-soft rounded-lg border border-line bg-paper px-2.5 py-1 hover:text-ink"
                title="Adjust token budget"
              >
                budget: {budget.toLocaleString()} tok
              </button>
              {pack && (
                <button
                  type="button"
                  onClick={() => setActiveModal("files")}
                  className="btn-soft hidden rounded-lg border border-line bg-paper px-2.5 py-1 hover:text-ink sm:inline-block"
                >
                  {pack.items.length} files packed
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => runQuery()}
              disabled={busy}
              className="btn-soft inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 font-mono text-xs font-medium text-paper hover:opacity-90 disabled:opacity-40"
            >
              <span>{busy ? (demo ? "Walking… (a few seconds on the free server)" : "Walking…") : "Unwind Context"}</span>
              <IconArrowRight size={13} />
            </button>
          </div>
        </div>

        {error && (
          <div className="pointer-events-auto rounded-xl border border-line bg-card px-4 py-1.5 font-mono text-xs text-ink shadow-sm">
            {error}
          </div>
        )}
      </div>

      {waitlistOpen && <WaitlistModal onClose={() => setWaitlistOpen(false)} />}
    </div>
  );
}

function DockIconButton({
  active,
  onClick,
  label,
  badge,
  tour,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  tour?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      data-tour={tour}
      className={`btn-soft group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
        active
          ? "bg-ink text-paper shadow-sm"
          : "text-ink-soft hover:bg-paper hover:text-ink"
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="num pointer-events-none absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-trail px-1 font-mono text-[9px] leading-none font-semibold text-white ring-2 ring-card">
          {badge}
        </span>
      )}
    </button>
  );
}
