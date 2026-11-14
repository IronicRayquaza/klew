export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--ink)" />
      <path d="M6 25c5-1 6-6 10-8s7-1 10-10" fill="none" stroke="var(--trail)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 4.5" />
      <circle cx="6" cy="25" r="2.6" fill="var(--trail)" />
      <circle cx="26" cy="7" r="2.6" fill="var(--moss)" />
    </svg>
  )
}
