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
import { tooltipProps, useElementWidth } from "./chartTooltip";

export type LearningPoint = {
  learned: number;
  learning: boolean;
  budget_recall: number;
  "recall@5": number;
  "hit@1": number;
  mrr: number;
};

export type LearningCurveData = {
  repo: string;
  held_out_commits: number;
  tuned_on_first: number;
  points: LearningPoint[];
};

const SERIES: {
  key: keyof LearningPoint;
  label: string;
  color: string;
  dash?: string;
  width: number;
}[] = [
  { key: "budget_recall", label: "Right file in context", color: "var(--trail)", width: 2.6 },
  { key: "recall@5", label: "Recall@5", color: "var(--moss)", width: 2.3 },
  { key: "mrr", label: "MRR", color: "var(--ink)", dash: "6 4", width: 1.8 },
  { key: "hit@1", label: "Top-1 hit", color: "var(--muted)", dash: "2 3", width: 1.6 },
];

export function LearningCurve({
  data,
  height = 320,
}: {
  data: LearningCurveData;
  height?: number;
}) {
  const [chartRef, chartW] = useElementWidth<HTMLDivElement>();
  const base = data.points.find((p) => !p.learning);
  const pts = data.points;

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-wrap items-center gap-2.5 font-mono text-xs text-muted">
        {SERIES.map((s) => (
          <div
            key={String(s.key)}
            className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1 text-ink"
          >
            <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">
              <line
                x1="1"
                y1="5"
                x2="19"
                y2="5"
                stroke={s.color}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
                strokeLinecap="round"
              />
              <circle cx="10" cy="5" r="2.4" fill={s.color} />
            </svg>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      <div ref={chartRef} style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={pts} margin={{ top: 12, right: 20, bottom: 10, left: -4 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
            <XAxis
              dataKey="learned"
              type="number"
              domain={[0, "dataMax"]}
              ticks={pts.map((p) => p.learned)}
              tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              label={{
                value: "past commits learned before freezing",
                position: "insideBottomRight",
                offset: -4,
                fill: "var(--muted)",
                fontSize: 11,
                fontFamily: "JetBrains Mono",
              }}
            />
            <YAxis
              domain={[0.3, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              {...tooltipProps(300, chartW)}
              formatter={(v: number, k: string) => [
                `${(v * 100).toFixed(1)}%`,
                SERIES.find((s) => s.key === k)?.label ?? k,
              ]}
              labelFormatter={(l) => `After learning from ${l} past commits`}
            />
            {base &&
              SERIES.map((s) => (
                <ReferenceLine
                  key={`b-${String(s.key)}`}
                  y={base[s.key] as number}
                  stroke={s.color}
                  strokeDasharray="3 4"
                  strokeOpacity={0.5}
                />
              ))}
            {SERIES.map((s) => (
              <Line
                key={String(s.key)}
                type="monotone"
                dataKey={s.key as string}
                stroke={s.color}
                strokeWidth={s.width}
                strokeDasharray={s.dash}
                dot={{ r: 3.5, fill: s.color, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
