import type { PathStep } from "../api";

/*
 * Why a file is in the pack, in one fixed shape for every file:
 *   Evidence: what in the task seeded it (name match, identifier, learned word, vector match)
 *   Thread:   the graph steps from that seed to the file, as a vertical timeline
 * The engine's seed_reason is "; "-joined, e.g. "name match: httpx/_utils.py; learned: 'environment' → this file".
 */

type EvidenceKind = "learned" | "name" | "mention" | "vector" | "other";
type Evidence = { kind: EvidenceKind; label: string; value: string };

const KIND_LABEL: Record<EvidenceKind, string> = {
  learned: "Learned",
  name: "Name match",
  mention: "Mentions",
  vector: "Vector match",
  other: "Seed",
};

// Learned links are experience (moss); everything else comes from the task text (trail).
const KIND_DOT: Record<EvidenceKind, string> = {
  learned: "bg-moss",
  name: "bg-trail",
  mention: "bg-trail",
  vector: "bg-ink-soft",
  other: "bg-muted",
};

function parseReason(reason: string | undefined): Evidence[] {
  if (!reason) return [];
  return reason
    .split("; ")
    .map((part): Evidence => {
      const learned = part.match(/^learned: '(.+)' → this file$/);
      if (learned) return { kind: "learned", label: KIND_LABEL.learned, value: `“${learned[1]}”` };
      if (part.startsWith("name match: "))
        return { kind: "name", label: KIND_LABEL.name, value: shortNode(part.slice(12)) };
      if (part.startsWith("mentions "))
        return { kind: "mention", label: KIND_LABEL.mention, value: part.slice(9).replace(/`/g, "") };
      if (part.startsWith("vector match: "))
        return { kind: "vector", label: KIND_LABEL.vector, value: shortNode(part.slice(14)) };
      return { kind: "other", label: KIND_LABEL.other, value: part };
    })
    .filter((e, i, all) => all.findIndex((x) => x.kind === e.kind && x.value === e.value) === i);
}

function shortNode(node: string) {
  if (node.includes("/")) return node.split("/").pop() || node;
  return node.split(".").slice(-2).join(".");
}

function EvidenceChip({ e }: { e: Evidence }) {
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-line bg-card py-1 pr-2.5 pl-2 font-mono text-[11px] leading-none"
      title={`${e.label}: ${e.value}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[e.kind]}`} aria-hidden="true" />
      <span className="shrink-0 text-muted">{e.label}</span>
      <span className="truncate text-ink">{e.value}</span>
    </span>
  );
}

function Evidence({ items }: { items: Evidence[] }) {
  if (!items.length) {
    return <p className="font-mono text-[11px] text-muted">No direct evidence; reached by the graph walk.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((e) => (
        <EvidenceChip key={`${e.kind}:${e.value}`} e={e} />
      ))}
    </div>
  );
}

/** Full variant: evidence chips, then a vertical timeline of graph steps ending at the file. */
export function WhyPath({ steps, reason, path }: { steps: PathStep[]; reason?: string; path?: string }) {
  const evidence = parseReason(reason);
  // Always end on the packed file, even when the engine's path stops at a symbol inside it.
  const nodes = steps.length ? steps : path ? [{ node_id: -1, node: path, via: null, weight: null }] : [];
  const last = nodes[nodes.length - 1];
  const thread = path && last && last.node !== path ? [...nodes, { node_id: -2, node: path, via: "defined in", weight: null }] : nodes;

  return (
    <div className="grid gap-3" aria-label="Why this file is in the pack">
      <section data-tour="evidence" className="grid gap-1.5">
        <h4 className="font-mono text-[10px] tracking-wider text-muted uppercase">Evidence</h4>
        <Evidence items={evidence} />
      </section>

      {thread.length > 0 && (
        <section data-tour="thread" className="grid gap-1.5">
          <h4 className="font-mono text-[10px] tracking-wider text-muted uppercase">
            Thread · {thread.length === 1 ? "direct" : `${thread.length - 1} hop${thread.length > 2 ? "s" : ""}`}
          </h4>
          <ol className="grid">
            {thread.map((s, i) => {
              const isLast = i === thread.length - 1;
              const isFile = s.node.endsWith(".py");
              return (
                <li key={`${s.node_id}-${i}`} className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2">
                  {/* rail: dot + connector */}
                  <span className="relative flex justify-center" aria-hidden="true">
                    <span
                      className={`relative z-10 mt-[7px] h-2 w-2 rounded-full ${
                        isLast ? "bg-moss" : i === 0 ? "bg-trail" : "border border-ink-soft bg-card"
                      }`}
                    />
                    {!isLast && <span className="absolute top-[11px] bottom-0 w-px bg-guide" />}
                  </span>
                  <div className={`min-w-0 ${isLast ? "" : "pb-2"}`}>
                    {s.via && i > 0 && (
                      <span className="block font-mono text-[10px] leading-4 text-muted">{s.via}</span>
                    )}
                    <span
                      className={`block truncate font-mono text-xs leading-[22px] ${
                        isFile && isLast ? "font-semibold text-ink" : "text-ink-soft"
                      }`}
                      title={s.node}
                    >
                      {isFile ? s.node : shortNode(s.node)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

/** Compact variant for lists: evidence chips plus a one-line summary of the walk, same height every row. */
export function WhyPathCompact({ steps, reason, path }: { steps: PathStep[]; reason?: string; path?: string }) {
  const evidence = parseReason(reason);
  const hops = steps.filter((s) => s.node !== path);
  const shown = evidence.slice(0, 2);
  const more = evidence.length - shown.length;
  return (
    <div className="grid gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {shown.length ? (
          shown.map((e) => <EvidenceChip key={`${e.kind}:${e.value}`} e={e} />)
        ) : (
          <span className="font-mono text-[11px] text-muted">Reached by the graph walk</span>
        )}
        {more > 0 && <span className="font-mono text-[11px] text-muted">+{more} more</span>}
      </div>
      <p className="truncate font-mono text-[11px] text-muted" title={hops.map((s) => s.node).join(" → ")}>
        {hops.length
          ? `via ${hops.map((s) => shortNode(s.node)).join(" → ")}`
          : "Packed directly from the evidence"}
      </p>
    </div>
  );
}
