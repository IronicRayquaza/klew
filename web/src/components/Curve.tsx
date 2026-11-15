import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ARM_COLOR, ARM_DASH, ARM_LABEL, type EvalResult } from "../api";

export type CurveMetric = "budget_recall" | "recall@5";

const ORDER = ["graph_hybrid", "graph_learn", "graph_nowalk", "graph_static", "vector", "bm25"];

export function Curve({
  result,
  metric = "budget_recall",
  arms,
  height = 520,
}: {
  result: EvalResult;
  metric?: CurveMetric;
  arms?: string[];
  height?: number;
}) {
  const available = (arms ?? ORDER.filter((a) => result.arms.includes(a))).filter(
    (a) => result.curves?.[a]?.[metric]?.length,
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggleArm = (arm: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(arm)) next.delete(arm);
      else if (next.size < available.length - 1) next.add(arm);
      return next;
    });
  };

  const show = available.filter((a) => !hidden.has(a));
  const n = result.curves?.[available[0]]?.[metric]?.length ?? 0;
  const skip = Math.min(20, Math.floor(n / 10));
  const data = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number> = { i: i + 1 };
    for (const a of available) row[a] = result.curves[a][metric][i];
    return row;
  }).slice(skip);

  return (
    <div className="w-full">
      {/* Interactive pill legend (no circle dots) */}
      <div className="mb-6 flex flex-wrap items-center gap-2 font-mono text-xs">
        {available.map((a) => {
          const isPrimary = a === "graph_hybrid" || a === "graph_learn";
          const isOff = hidden.has(a);
          const dash = ARM_DASH[a];
          return (
            <button
              key={a}
              type="button"
              onClick={() => toggleArm(a)}
              className={`btn-soft inline-flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 transition-opacity ${
                isOff
                  ? "border-line/50 bg-paper/40 text-muted opacity-45"
                  : isPrimary
                    ? "border-line bg-paper font-medium text-ink"
                    : "border-line/70 bg-paper/60 text-muted hover:text-ink"
              }`}
              title="Click to toggle series"
            >
              <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true">
                <line
                  x1="1"
                  y1="4"
                  x2="23"
                  y2="4"
                  stroke={ARM_COLOR[a]}
                  strokeWidth={a === "graph_hybrid" ? 3 : isPrimary ? 2.5 : 1.75}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                />
              </svg>
              <span>{ARM_LABEL[a] ?? a}</span>
            </button>
          );
        })}
      </div>

      <div style={{ width: "100%", height }} className="rounded-2xl bg-paper/45 p-3 sm:p-5">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 18, right: 24, bottom: 28, left: 4 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
            <XAxis
              dataKey="i"
              minTickGap={56}
              tickMargin={10}
              tickFormatter={(v: number) => `#${v}`}
              tick={{ fill: "var(--muted)", fontSize: 11.5, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              label={{
                value: "commits replayed chronologically",
                position: "insideBottomRight",
                offset: -14,
                fill: "var(--muted)",
                fontSize: 11.5,
                fontFamily: "JetBrains Mono",
              }}
            />
            <YAxis
              domain={[0.25, 1.0]}
              ticks={[0.25, 0.45, 0.65, 0.85, 1.0]}
              tickMargin={8}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tick={{ fill: "var(--muted)", fontSize: 11.5, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(255, 255, 255, 0.97)",
                border: "1px solid var(--line)",
                borderRadius: "16px",
                boxShadow: "0 12px 32px rgba(23, 42, 56, 0.08)",
                color: "var(--ink)",
                fontFamily: "JetBrains Mono",
                fontSize: 12,
                padding: "12px 16px",
              }}
              formatter={(v: number, k: string) => [
                `${(v * 100).toFixed(1)}%`,
                ARM_LABEL[k] ?? k,
              ]}
              labelFormatter={(l) => `Commit #${l} (trailing 50 window)`}
            />
            {result.tuned_on_first && result.tuned_on_first > skip ? (
              <ReferenceLine
                x={result.tuned_on_first}
                stroke="var(--muted)"
                strokeDasharray="4 4"
                label={{
                  value: "held-out starts →",
                  position: "insideTopRight",
                  fontSize: 11,
                  fontFamily: "JetBrains Mono",
                  fill: "var(--muted)",
                }}
              />
            ) : null}
            {show.map((a) => (
              <Line
                key={a}
                type="monotone"
                dataKey={a}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
                stroke={ARM_COLOR[a] ?? "var(--ink)"}
                strokeDasharray={ARM_DASH[a]}
                strokeWidth={a === "graph_hybrid" ? 3.2 : a === "graph_learn" ? 2.6 : 1.75}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
