/**
 * The fixed backdrop behind every page: sunlit sky gradients, a breathing sun, faint topographic contour lines, and paper grain (Cult UI texture-overlay).
 *
 * Inputs:
 * - None (follows the current light/dark theme through CSS tokens)
 *
 * Outputs:
 * - A decorative, pointer-transparent layer
 */

import { TextureOverlay } from "@/components/ui/texture-overlay"

// Faint contour lines for texture.
function contour(i: number) {
  const y = 90 + i * 70
  const a = 18 + (i % 3) * 8
  return `M -50 ${y} C 200 ${y - a}, 380 ${y + a}, 620 ${y - a / 2} S 1040 ${y + a}, 1250 ${y - a / 3} S 1560 ${y + a / 2}, 1700 ${y}`
}

export function SolarBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="solar-sky absolute inset-0" />
      <div className="solar-breathe absolute -top-40 right-[-10rem] size-[34rem] rounded-full bg-[radial-gradient(circle,var(--sun)_0%,transparent_65%)] opacity-60 blur-2xl dark:opacity-25" />
      <svg className="absolute inset-0 h-full w-full text-primary opacity-[0.09] dark:opacity-[0.12]" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 13 }, (_, i) => (
          <path key={i} d={contour(i)} fill="none" stroke="currentColor" strokeWidth={i % 4 === 0 ? 1.4 : 0.8} />
        ))}
      </svg>
      <TextureOverlay texture="paperGrain" opacity={0.35} className="mix-blend-multiply dark:mix-blend-soft-light" />
    </div>
  )
}
