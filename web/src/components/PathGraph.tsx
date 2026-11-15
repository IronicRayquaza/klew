import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { ContextPack } from "../api";
import { IconMinus, IconPlus } from "./Icons";

type N = {
  id: string;
  label: string;
  kind: "seed" | "file" | "symbol";
  score: number;
  rank?: number;
  filePath?: string;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
};

type L = {
  source: string | N;
  target: string | N;
  via: string;
  files: Set<string>;
};

export function PathGraph({
  pack,
  focusFile,
  onSelectFile,
}: {
  pack: ContextPack;
  focusFile?: string | null;
  onSelectFile?: (path: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 1280, h: 800 });
  const [showAllNodes, setShowAllNodes] = useState(false);

  const fitGraph = useCallback((duration = 420, pad = 110) => {
    if (!fgRef.current) return;
    try {
      fgRef.current.zoomToFit(duration, pad);
    } catch {
      // ignore if canvas not mounted yet
    }
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setSize({ w: el.clientWidth, h: el.clientHeight });
      }
    });
    ro.observe(el);
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    }
    return () => ro.disconnect();
  }, []);

  // Build graph topology ONLY when `pack` or `showAllNodes` changes.
  // Never rebuild on `focusFile` change so node (x, y) positions remain stable and interactive.
  const graphData = useMemo(() => {
    const nodes = new Map<string, N>();
    const links = new Map<string, L>();

    const taskHubId = "__task_clew__";
    nodes.set(taskHubId, {
      id: taskHubId,
      label: "Task Clew",
      kind: "seed",
      score: 1,
      x: 0,
      y: 0,
      fx: 0,
      fy: 0,
    });

    // Show top 12 files by default for a clean, legible constellation (or all if toggled)
    const visibleItems = showAllNodes ? pack.items : pack.items.slice(0, 12);
    const total = Math.max(1, visibleItems.length);

    visibleItems.forEach((it, itemIdx) => {
      const rank = itemIdx + 1;
      const angle = (2 * Math.PI * itemIdx) / total - Math.PI / 2;
      let prev: string = taskHubId;

      if (it.why.length === 0) {
        const fileId = String(it.file_id);
        if (!nodes.has(fileId)) {
          nodes.set(fileId, {
            id: fileId,
            label: it.path,
            kind: "file",
            score: it.score,
            rank,
            filePath: it.path,
            x: Math.cos(angle) * 180,
            y: Math.sin(angle) * 180,
          });
        }
        const lKey = `${taskHubId}>${fileId}`;
        const existing = links.get(lKey);
        if (existing) existing.files.add(it.path);
        else {
          links.set(lKey, {
            source: taskHubId,
            target: fileId,
            via: it.seed_reason ? "seed" : "direct",
            files: new Set([it.path]),
          });
        }
        return;
      }

      it.why.forEach((s, stepIdx) => {
        const id = String(s.node_id);
        const isFileNode = s.node.endsWith(".py");
        const kind: N["kind"] = isFileNode ? "file" : "symbol";
        const cur = nodes.get(id);
        const radius = isFileNode ? 210 : 115 + stepIdx * 45;

        if (!cur || kind === "file") {
          nodes.set(id, {
            id,
            label: s.node,
            kind,
            score: isFileNode ? it.score : cur?.score ?? 0.6,
            rank: isFileNode ? rank : cur?.rank,
            filePath: isFileNode ? it.path : cur?.filePath ?? it.path,
            x: cur?.x ?? Math.cos(angle) * radius,
            y: cur?.y ?? Math.sin(angle) * radius,
          });
        }

        if (prev && prev !== id) {
          const lKey = `${prev}>${id}`;
          const existing = links.get(lKey);
          if (existing) {
            existing.files.add(it.path);
          } else {
            links.set(lKey, {
              source: prev,
              target: id,
              via: s.via ?? (stepIdx === 0 ? "unwinds" : ""),
              files: new Set([it.path]),
            });
          }
        }
        prev = id;
      });

      const fileId = String(it.file_id);
      const existingFile = nodes.get(fileId);
      if (existingFile) {
        existingFile.score = it.score;
        existingFile.rank = existingFile.rank ?? rank;
        existingFile.filePath = it.path;
      } else {
        nodes.set(fileId, {
          id: fileId,
          label: it.path,
          kind: "file",
          score: it.score,
          rank,
          filePath: it.path,
          x: Math.cos(angle) * 220,
          y: Math.sin(angle) * 220,
        });
        if (prev !== fileId) {
          const lKey = `${prev}>${fileId}`;
          const existing = links.get(lKey);
          if (existing) existing.files.add(it.path);
          else {
            links.set(lKey, {
              source: prev,
              target: fileId,
              via: "defined in",
              files: new Set([it.path]),
            });
          }
        }
      }
    });

    return {
      nodes: [...nodes.values()],
      links: [...links.values()],
    };
  }, [pack, showAllNodes]);

  // Compute which node IDs belong to the currently focused file's why-path thread
  const focusSet = useMemo(() => {
    const set = new Set<string>();
    if (!focusFile) return set;
    const targetItem = pack.items.find((it) => it.path === focusFile);
    if (!targetItem) return set;
    set.add("__task_clew__");
    set.add(String(targetItem.file_id));
    for (const s of targetItem.why) {
      set.add(String(s.node_id));
    }
    return set;
  }, [pack, focusFile]);

  // Configure spacious radial-like repulsion when graphData changes
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      const charge = fg.d3Force("charge") as { strength?: (n: number) => void } | undefined;
      charge?.strength?.(-340);
      const linkForce = fg.d3Force("link") as { distance?: (n: number) => void } | undefined;
      linkForce?.distance?.(95);
      fg.d3ReheatSimulation();
    } catch {
      // ignore
    }
    const timer = window.setTimeout(() => fitGraph(420, 115), 260);
    return () => window.clearTimeout(timer);
  }, [graphData, fitGraph]);

  // Gently pan toward the focused file node without resetting zoom or freezing the graph
  useEffect(() => {
    if (!focusFile || !fgRef.current) return;
    const targetNode = graphData.nodes.find((n) => n.filePath === focusFile && n.kind === "file");
    if (
      targetNode &&
      typeof targetNode.x === "number" &&
      typeof targetNode.y === "number" &&
      Number.isFinite(targetNode.x) &&
      Number.isFinite(targetNode.y)
    ) {
      try {
        // Pan halfway between Task Clew (0,0) and the selected file so the whole thread stays centered
        fgRef.current.centerAt(targetNode.x * 0.45, targetNode.y * 0.45, 320);
      } catch {
        // ignore
      }
    }
  }, [focusFile, graphData]);

  const zoomBy = (factor: number) => {
    if (!fgRef.current) return;
    try {
      const cur = fgRef.current.zoom();
      fgRef.current.zoom(cur * factor, 220);
    } catch {
      // ignore
    }
  };

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden bg-playground-dots">
      {/* Top-Left Canvas Controls & Hint Pill (never overlaps the bottom prompt composer) */}
      <div className="surface-glass absolute top-5 left-5 z-10 flex flex-wrap items-center gap-1 rounded-full p-1">
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          className="btn-soft flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium text-ink hover:bg-paper"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <IconPlus size={14} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.8)}
          className="btn-soft flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium text-ink hover:bg-paper"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <IconMinus size={14} />
        </button>
        <button
          type="button"
          onClick={() => fitGraph(360, 110)}
          className="btn-soft rounded-full px-3 py-1 font-mono text-[11px] font-medium text-ink hover:bg-paper"
          title="Fit graph in view"
        >
          Fit view
        </button>
        {pack.items.length > 12 && (
          <button
            type="button"
            onClick={() => setShowAllNodes((v) => !v)}
            className="btn-soft rounded-full border border-line bg-paper px-3 py-1 font-mono text-[11px] text-muted hover:text-ink"
          >
            {showAllNodes ? "Top 12 files" : `All ${pack.items.length} files`}
          </button>
        )}
        {focusFile && (
          <button
            type="button"
            onClick={() => onSelectFile?.("")}
            className="btn-soft rounded-full bg-ink px-3 py-1 font-mono text-[11px] font-medium text-paper"
          >
            Show all threads
          </button>
        )}
      </div>

      <ForceGraph2D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={graphData}
        autoPauseRedraw={false}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        cooldownTicks={120}
        d3AlphaDecay={0.028}
        d3VelocityDecay={0.35}
        backgroundColor="rgba(0,0,0,0)"
        linkCurvature={0.14}
        onBackgroundClick={() => {
          if (focusFile && onSelectFile) onSelectFile("");
        }}
        linkColor={(l) => {
          const link = l as L;
          const hasFocus = Boolean(focusFile) && focusSet.size > 0;
          const isFocused = !hasFocus || link.files.has(focusFile!);
          if (!isFocused) return "rgba(180, 178, 168, 0.32)";
          const via = String(link.via || "");
          if (via.includes("points") || via.includes("changes") || via.includes("tested")) {
            return "#2b7a58";
          }
          return hasFocus ? "#c47a1b" : "rgba(23, 42, 56, 0.38)";
        }}
        linkWidth={(l) => {
          const link = l as L;
          const hasFocus = Boolean(focusFile) && focusSet.size > 0;
          const isFocused = !hasFocus || link.files.has(focusFile!);
          if (!isFocused) return 1;
          return hasFocus ? 2.4 : 1.4;
        }}
        linkDirectionalArrowLength={4.5}
        linkDirectionalArrowRelPos={0.86}
        linkDirectionalParticles={(l) => {
          const link = l as L;
          const hasFocus = Boolean(focusFile) && focusSet.size > 0;
          if (!hasFocus) return 1;
          return link.files.has(focusFile!) ? 2 : 0;
        }}
        linkDirectionalParticleWidth={2.4}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleColor={(l) => {
          const link = l as L;
          const via = String(link.via || "");
          return via.includes("points") || via.includes("changes") ? "#2b7a58" : "#c47a1b";
        }}
        onNodeClick={(n) => {
          const node = n as N;
          if (node.id === "__task_clew__") {
            onSelectFile?.("");
            return;
          }
          if (node.filePath && onSelectFile) {
            onSelectFile(node.filePath);
          } else if (node.label.endsWith(".py") && onSelectFile) {
            onSelectFile(node.label);
          }
        }}
        nodeCanvasObject={(node, ctx, scale) => {
          const n = node as N & { x: number; y: number };
          if (typeof n.x !== "number" || typeof n.y !== "number") return;

          const hasFocus = Boolean(focusFile) && focusSet.size > 0;
          const isFocused = !hasFocus || focusSet.has(n.id);
          const isSelectedFile = Boolean(focusFile && n.filePath === focusFile && n.kind === "file");
          const isHub = n.id === "__task_clew__";

          ctx.save();
          // Keep unfocused nodes legible (0.48) so the user can always see and click them
          ctx.globalAlpha = isFocused ? 1 : 0.48;

          const r = isHub ? 7.5 : n.kind === "file" ? 5.5 : 4;

          // Subtle ring around active node or hub
          if (isSelectedFile || isHub) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 4.5, 0, 2 * Math.PI);
            ctx.fillStyle = isHub
              ? "rgba(196, 122, 27, 0.15)"
              : "rgba(43, 122, 88, 0.18)";
            ctx.fill();
          }

          // Node circle
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = isHub
            ? "#c47a1b"
            : isSelectedFile
              ? "#2b7a58"
              : n.kind === "file"
                ? "#172a38"
                : "#ffffff";
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = n.kind === "symbol" ? "#5a6d78" : "#ffffff";
          ctx.stroke();

          // Compact, clean pill label below node
          const shortName = isHub
            ? "Task Clew"
            : n.kind === "file"
              ? n.label.split("/").pop() || n.label
              : n.label.split(".").slice(-1)[0];

          const rankPrefix = n.kind === "file" && n.rank ? `#${n.rank} ` : "";
          const rawLabel = `${rankPrefix}${shortName}`;

          const fontSize = Math.min(11, Math.max(8.5 / Math.sqrt(scale), 3.8));
          ctx.font = `${isSelectedFile || isHub ? "600" : "500"} ${fontSize}px "JetBrains Mono", monospace`;
          const textWidth = ctx.measureText(rawLabel).width;
          const padX = fontSize * 0.5;
          const padY = fontSize * 0.28;
          const pillW = textWidth + padX * 2;
          const pillH = fontSize + padY * 2;
          const pillX = n.x - pillW / 2;
          const pillY = n.y + r + 3;

          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
          ctx.fillStyle = isSelectedFile
            ? "#172a38"
            : "rgba(255, 255, 255, 0.92)";
          ctx.fill();
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = isSelectedFile
            ? "#172a38"
            : "rgba(213, 210, 200, 0.9)";
          ctx.stroke();

          ctx.fillStyle = isSelectedFile
            ? "#ffffff"
            : n.kind === "file" || isHub
              ? "#172a38"
              : "#5a6d78";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(rawLabel, n.x, pillY + pillH / 2);

          ctx.restore();
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as N & { x: number; y: number };
          if (typeof n.x !== "number" || typeof n.y !== "number") return;
          ctx.fillStyle = color;
          // Make both the circle and the label pill below it clickable
          ctx.beginPath();
          ctx.roundRect(n.x - 36, n.y - 10, 72, 34, 8);
          ctx.fill();
        }}
      />
    </div>
  );
}
