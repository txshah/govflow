/**
 * The fixed backdrop behind every page: a plain page color with a barely-there warm wash at the top.
 *
 * Inputs:
 * - None (follows the current light/dark theme through CSS tokens)
 *
 * Outputs:
 * - A decorative, pointer-transparent layer
 */

export function SolarBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-background">
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-[color-mix(in_oklch,var(--sun)_8%,transparent)] to-transparent" />
    </div>
  )
}
