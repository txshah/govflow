/**
 * GovFlow mark: a sun over a flowing line — money moving cleanly from one party to the next.
 *
 * Inputs:
 * - className
 *
 * Outputs:
 * - Inline SVG using theme tokens
 */

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="14" r="6.5" fill="var(--sun)" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return (
          <line
            key={i}
            x1={16 + Math.cos(a) * 9}
            y1={14 + Math.sin(a) * 9}
            x2={16 + Math.cos(a) * 11.5}
            y2={14 + Math.sin(a) * 11.5}
            stroke="var(--sun)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        )
      })}
      <path d="M3 26c5-5 9-5 13 0s8 5 13 0" stroke="var(--primary)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}
