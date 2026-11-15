import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
  variant?: "badge" | "bare";
}

/**
 * Klew Brand Mark
 *
 * Visualizes the three core pillars of the name "Klew" (/kluː/, from Middle English *clew*):
 * 1. The Labyrinth / Code Graph: a 3×3 architectural matrix of nodes.
 * 2. Ariadne's Clew: a concentric coiled ball of thread at top-left (8.5, 8.5) whose unwinding
 *    strand forms both a multi-hop why-path and the letter "K".
 * 3. Continual Learning (Desirepath): the thread begins as exploratory dots and solidifies
 *    into a worn amber trail (--trail) arriving at the reinforced target node (--moss).
 */
export const Logo: React.FC<LogoProps> = ({
  size = 28,
  className = "",
  variant = "badge",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
      aria-label="Klew logo mark"
      role="img"
    >
      {variant === "badge" && (
        <rect
          x="1"
          y="1"
          width="30"
          height="30"
          rx="7"
          fill="#18303f"
          stroke="#2b485a"
          strokeWidth="1"
        />
      )}

      {/* Unvisited 3x3 Labyrinth / Code-Graph Matrix Nodes */}
      <g
        fill={variant === "badge" ? "#8fa3ae" : "currentColor"}
        opacity={variant === "badge" ? "0.42" : "0.28"}
      >
        <circle cx="16" cy="7.5" r="1.2" />
        <circle cx="16" cy="16" r="1.2" />
        <circle cx="23.5" cy="16" r="1.2" />
        <circle cx="16" cy="24.5" r="1.2" />
      </g>

      {/* Exploratory Dotted Thread (unwinding from the Clew at (8.5, 7.5) down to (8.5, 16)) */}
      <circle
        cx="8.5"
        cy="11.5"
        r="0.8"
        fill={variant === "badge" ? "#e0a23b" : "var(--trail)"}
        opacity="0.72"
      />
      <circle
        cx="8.5"
        cy="13.4"
        r="0.85"
        fill={variant === "badge" ? "#e0a23b" : "var(--trail)"}
        opacity="0.95"
      />

      {/* Solid Reinforced Desire-Path Thread (forming the letter K on the 3x3 grid) */}
      <path
        d="M 8.5 16 L 8.5 24.5"
        stroke={variant === "badge" ? "#e0a23b" : "var(--trail)"}
        strokeWidth="2.15"
        strokeLinecap="round"
      />
      <path
        d="M 23.5 7.5 L 8.5 16 L 23.5 24.5"
        stroke={variant === "badge" ? "#e0a23b" : "var(--trail)"}
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Top-Left Origin: Ariadne's Clew (concentric coiled ball of thread) */}
      <circle
        cx="8.5"
        cy="7.5"
        r="2.25"
        fill={variant === "badge" ? "#18303f" : "var(--paper)"}
        stroke={variant === "badge" ? "#e0a23b" : "var(--trail)"}
        strokeWidth="1.25"
      />
      <circle
        cx="8.5"
        cy="7.5"
        r="0.95"
        fill={variant === "badge" ? "#e0a23b" : "var(--trail)"}
      />

      {/* Graph Traversal Nodes along the 3x3 K coordinates */}
      <circle
        cx="8.5"
        cy="16"
        r="1.85"
        fill={variant === "badge" ? "#18303f" : "var(--paper)"}
        stroke={variant === "badge" ? "#e0a23b" : "var(--trail)"}
        strokeWidth="1.5"
      />
      <circle
        cx="8.5"
        cy="24.5"
        r="1.85"
        fill={variant === "badge" ? "#e0a23b" : "var(--trail)"}
      />
      <circle
        cx="23.5"
        cy="7.5"
        r="1.85"
        fill={variant === "badge" ? "#e0a23b" : "var(--trail)"}
      />

      {/* Reinforced Target File Node (Moss) */}
      <circle
        cx="23.5"
        cy="24.5"
        r="2.35"
        fill={variant === "badge" ? "#6fc29a" : "var(--moss)"}
      />
    </svg>
  );
};

interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  showPronunciation?: boolean;
  className?: string;
}

export const Wordmark: React.FC<WordmarkProps> = ({
  size = "md",
  showPronunciation = false,
  className = "",
}) => {
  const iconSize = size === "sm" ? 24 : size === "lg" ? 34 : 28;
  const textClass =
    size === "sm"
      ? "text-base"
      : size === "lg"
        ? "text-2xl tracking-[-0.03em]"
        : "text-[1.15rem] tracking-[-0.025em]";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Logo size={iconSize} />
      <span className="inline-flex items-baseline gap-2">
        <span
          className={`font-display font-semibold leading-none text-ink ${textClass}`}
        >
          klew
        </span>
        {showPronunciation && (
          <span className="hidden font-mono text-[10px] tracking-[0.06em] text-muted sm:inline">
            /kluː/
          </span>
        )}
      </span>
    </span>
  );
};

/**
 * Monumental Architectural Outline Wordmark for the Footer
 */
export const FooterWordmark: React.FC = () => {
  return (
    <div className="relative w-full overflow-hidden py-4 select-none" aria-hidden="true">
      <svg
        viewBox="0 0 1200 210"
        className="w-full h-auto block"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="0" y1="24" x2="1200" y2="24" stroke="var(--line)" strokeDasharray="4 6" />
        <line x1="0" y1="186" x2="1200" y2="186" stroke="var(--line)" strokeDasharray="4 6" />

        <path
          d="M 40 186 C 180 186, 240 48, 410 48 C 580 48, 630 162, 820 162 C 960 162, 1040 74, 1160 74"
          stroke="var(--trail)"
          strokeWidth="2"
          strokeDasharray="6 6"
          opacity="0.45"
        />
        <circle cx="40" cy="186" r="4.5" fill="var(--trail)" opacity="0.7" />
        <circle cx="410" cy="48" r="4" fill="var(--trail)" opacity="0.7" />
        <circle cx="820" cy="162" r="4" fill="var(--trail)" opacity="0.7" />
        <circle cx="1160" cy="74" r="5.5" fill="var(--moss)" opacity="0.85" />

        <text
          x="50%"
          y="168"
          textAnchor="middle"
          fontFamily="Bricolage Grotesque, sans-serif"
          fontWeight="700"
          fontSize="196"
          letterSpacing="-8"
          stroke="var(--line)"
          strokeWidth="1.75"
          fill="transparent"
        >
          KLEW
        </text>
      </svg>
    </div>
  );
};
