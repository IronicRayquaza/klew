import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import overview from "../docs/overview.md?raw";
import quickstart from "../docs/quickstart.md?raw";
import mcp from "../docs/mcp.md?raw";
import cli from "../docs/cli.md?raw";
import api from "../docs/api.md?raw";
import action from "../docs/github-action.md?raw";
import library from "../docs/library.md?raw";
import concepts from "../docs/concepts.md?raw";
import architecture from "../docs/architecture.md?raw";
import evaluation from "../docs/evaluation.md?raw";
import integrations from "../docs/integrations.md?raw";
import faq from "../docs/faq.md?raw";

type Page = { slug: string; title: string; md: string };

const GROUPS: { name: string; pages: Page[] }[] = [
  {
    name: "Start here",
    pages: [
      { slug: "overview", title: "Overview", md: overview },
      { slug: "quickstart", title: "Quickstart", md: quickstart },
      { slug: "concepts", title: "How it works", md: concepts },
    ],
  },
  {
    name: "Using Klew",
    pages: [
      { slug: "mcp", title: "MCP server", md: mcp },
      { slug: "cli", title: "CLI reference", md: cli },
      { slug: "api", title: "REST API", md: api },
      { slug: "github-action", title: "GitHub Action", md: action },
      { slug: "library", title: "Python library", md: library },
    ],
  },
  {
    name: "Under the hood",
    pages: [
      { slug: "architecture", title: "Architecture & HydraDB", md: architecture },
      { slug: "evaluation", title: "Evaluation & benchmarks", md: evaluation },
    ],
  },
  {
    name: "Product",
    pages: [
      { slug: "integrations", title: "Integrations & plans", md: integrations },
      { slug: "faq", title: "Troubleshooting & FAQ", md: faq },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.pages);

export function Docs({
  slug,
  onNavigate,
}: {
  slug?: string;
  onNavigate: (slug: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const normalizedSlug = slug === "action" ? "github-action" : slug;
  const page = ALL.find((p) => p.slug === normalizedSlug) ?? ALL[0];
  const idx = ALL.indexOf(page);

  const html = useMemo(() => marked.parse(page.md, { async: false }) as string, [page]);
  const bodyRef = useRef<HTMLDivElement>(null);

  const headings = useMemo(() => {
    const lines = page.md.split("\n");
    const out: string[] = [];
    for (const line of lines) {
      const m = /^##\s+(.+)$/.exec(line.trim());
      if (m) out.push(m[1].replace(/`/g, "").trim());
    }
    return out;
  }, [page.md]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector("button")) return;
      pre.style.position = "relative";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Copy";
      btn.className =
        "btn-soft absolute top-3 right-3 rounded-full border border-line bg-card px-3 py-1 font-mono text-[11px] text-muted shadow-2xs hover:border-trail hover:text-ink";
      btn.addEventListener("click", () => {
        const text = pre.querySelector("code")?.textContent ?? "";
        navigator.clipboard.writeText(text).then(
          () => {
            btn.textContent = "Copied ✓";
            setTimeout(() => (btn.textContent = "Copy"), 1500);
          },
          () => {
            btn.textContent = "Select & copy";
          },
        );
      });
      pre.appendChild(btn);
    });
  }, [html]);

  return (
    <div className="px-frame py-10 sm:py-14">
      {/* Mobile Select Bar */}
      <div className="mb-6 lg:hidden">
        <label
          htmlFor="docs-mobile-select"
          className="block font-mono text-xs uppercase tracking-wider text-muted"
        >
          Jump to manual page
        </label>
        <select
          id="docs-mobile-select"
          value={page.slug}
          onChange={(e) => onNavigate(e.target.value)}
          className="mt-2 w-full rounded-2xl border border-line bg-card px-4 py-3 font-mono text-xs text-ink"
        >
          {ALL.map((p, i) => (
            <option key={p.slug} value={p.slug}>
              {String(i + 1).padStart(2, "0")} · {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* 12-Column Breathable Manual Layout */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* Left 3 Columns: Soft Sidebar Navigation */}
        <aside className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-24 space-y-6">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search 12 pages…"
              className="w-full rounded-full border border-line bg-card px-4 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-trail focus:outline-none"
            />

            {GROUPS.map((g) => {
              const q = filter.trim().toLowerCase();
              const groupPages = q
                ? g.pages.filter(
                    (p) =>
                      p.title.toLowerCase().includes(q) || p.md.toLowerCase().includes(q),
                  )
                : g.pages;
              if (groupPages.length === 0) return null;
              return (
                <div key={g.name}>
                  <div className="px-3 font-mono text-[11px] uppercase tracking-wider text-muted">
                    {g.name}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {groupPages.map((p) => {
                      const active = p.slug === page.slug;
                      return (
                        <li key={p.slug}>
                          <a
                            href={`#docs/${p.slug}`}
                            onClick={(e) => {
                              e.preventDefault();
                              onNavigate(p.slug);
                            }}
                            className={`btn-soft flex items-center justify-between rounded-full px-3.5 py-2 no-underline ${
                              active
                                ? "bg-ink font-medium text-paper shadow-xs"
                                : "text-muted hover:bg-card hover:text-ink"
                            }`}
                          >
                            <span>{p.title}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center 7 Columns: Soft Article Card */}
        <article className="min-w-0 lg:col-span-7">
          <div className="surface-card p-7 sm:p-12">
            <div
              ref={bodyRef}
              className="docs-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>

          {/* Prev / Next Soft Cards */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {idx > 0 ? (
              <a
                href={`#docs/${ALL[idx - 1].slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(ALL[idx - 1].slug);
                }}
                className="surface-card btn-soft block p-5 no-underline"
              >
                <div className="font-mono text-xs text-muted">← Previous</div>
                <div className="mt-1 font-display text-lg font-semibold text-ink">
                  {ALL[idx - 1].title}
                </div>
              </a>
            ) : (
              <div />
            )}

            {idx < ALL.length - 1 ? (
              <a
                href={`#docs/${ALL[idx + 1].slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(ALL[idx + 1].slug);
                }}
                className="surface-card btn-soft block p-5 text-right no-underline"
              >
                <div className="font-mono text-xs text-muted">Next →</div>
                <div className="mt-1 font-display text-lg font-semibold text-ink">
                  {ALL[idx + 1].title}
                </div>
              </a>
            ) : (
              <div />
            )}
          </div>
        </article>

        {/* Right 2 Columns: On-Page Section Outline */}
        <aside className="hidden xl:col-span-2 xl:block">
          <div className="sticky top-24">
            <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
              On this page
            </div>
            {headings.length > 0 ? (
              <ul className="mt-3 space-y-2.5 border-l border-line pl-3.5 text-xs text-muted">
                {headings.map((h) => (
                  <li key={h} className="leading-snug">
                    {h}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">Single-section reference</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
