import type React from "react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

/*
 * Shared Recharts tooltip settings. Recharts animates the tooltip's position over 400 ms by default, so on a
 * dense line chart it trails the cursor and, when it flips sides near the edge, slides across the whole plot.
 * It also re-measures itself whenever its width changes, which shows up as a one-frame flicker.
 * Here: no position animation, a fixed width (tabular numbers), pinned near the top of the plot so it only moves
 * horizontally, kept inside the chart, and never under the pointer.
 */
export const tooltipProps = (width: number, chartWidth?: number) => ({
  isAnimationActive: false,
  allowEscapeViewBox: { x: false, y: false },
  offset: 18,
  position: { y: 12 },
  wrapperStyle: { pointerEvents: "none", zIndex: 20, outline: "none" } as CSSProperties,
  contentStyle: {
    background: "rgba(255, 255, 255, 0.97)",
    border: "1px solid var(--line)",
    borderRadius: "16px",
    boxShadow: "0 12px 32px rgba(23, 42, 56, 0.08)",
    color: "var(--ink)",
    fontFamily: "JetBrains Mono",
    fontSize: chartWidth && chartWidth < 420 ? 11 : 12,
    fontVariantNumeric: "tabular-nums",
    padding: chartWidth && chartWidth < 420 ? "9px 11px" : "12px 16px",
    // Fixed width so it never re-measures, but never wider than the chart on small screens.
    width: chartWidth ? Math.min(width, Math.max(170, chartWidth - 70)) : width,
    whiteSpace: "normal",
  } as CSSProperties,
  itemStyle: { padding: "1px 0" } as CSSProperties,
  cursor: { stroke: "var(--guide)", strokeWidth: 1 },
});

/** Width of an element, kept current with a ResizeObserver (for sizing the tooltip to its chart). */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
