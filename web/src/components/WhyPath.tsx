import type { PathStep } from "../api";
import { IconArrowRight } from "./Icons";

function short(node: string) {
  if (node.endsWith(".py")) return node;
  const parts = node.split(".");
  return parts.slice(-2).join(".");
}

export function WhyPath({ steps, reason }: { steps: PathStep[]; reason?: string }) {
  if (!steps.length) {
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-paper px-3 py-1 font-mono text-xs text-muted">
        {reason ? `seed: ${reason}` : "direct seed match"}
      </span>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 font-mono text-xs leading-relaxed"
      aria-label="Why-path thread from task seed to file"
    >
      {reason && (
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[10px] text-muted">
            {reason}
          </span>
          <IconArrowRight size={11} className="text-muted" />
        </span>
      )}
      {steps.map((s, i) => {
        const via = s.via;
        const isFile = s.node.endsWith(".py");

        return (
          <span key={`${s.node_id}-${i}`} className="inline-flex items-center gap-1.5">
            {via && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                <IconArrowRight size={11} />
                <span className="rounded-full border border-line/80 bg-paper px-2 py-0.5 text-[10px] leading-none text-ink-soft">
                  {via}
                  {s.weight && s.weight > 1 ? ` ×${s.weight.toFixed(1)}` : ""}
                </span>
                <IconArrowRight size={11} />
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-0.5 break-all ${
                isFile
                  ? "bg-ink font-medium text-paper"
                  : "border border-line bg-card text-ink"
              }`}
              title={s.node}
            >
              {short(s.node)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
