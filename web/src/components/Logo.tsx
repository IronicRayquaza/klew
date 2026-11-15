import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
}


/**
 * Klew brand mark: the K with its colonnade (Pratham's logo, web/public/brand/logo.svg).
 * Served as a static SVG so the browser caches it; `size` is the mark's height in px.
 */
export const Logo: React.FC<LogoProps> = ({ size = 28, className = "" }) => (
  <img
    src="/brand/logo.svg"
    alt=""
    aria-hidden="true"
    height={size}
    width={Math.round((size * 1256) / 1060)}
    className={`block shrink-0 ${className}`}
    draggable={false}
  />
);

/** Full logo with the name (mark over the “Klew” lettering), used in the footer. */
export const LogoWithName: React.FC<{ height?: number; className?: string }> = ({ height = 96, className = "" }) => (
  <img
    src="/brand/logo-with-name.svg"
    alt="Klew"
    height={height}
    width={Math.round((height * 324) / 349)}
    className={`block ${className}`}
    draggable={false}
  />
);

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
  const iconSize = size === "sm" ? 26 : size === "lg" ? 38 : 32;
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
          Klew
        </span>
        {showPronunciation && (
          <span className="hidden font-mono text-[10px] tracking-[0.06em] text-ink-soft sm:inline">
            /kluː/
          </span>
        )}
      </span>
    </span>
  );
};
