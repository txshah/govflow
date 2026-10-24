"use client"

/**
 * The frame around every page: sunlit backdrop, a slim top bar (mark, project, live pulse island, day/night toggle, "viewing as"), the page with a soft fade-and-grow transition, and the floating dock for navigation.
 *
 * Inputs:
 * - Current path, theme, live data
 *
 * Outputs:
 * - Backdrop + top bar + animated page + dock
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { motion } from "motion/react"
import { useTheme } from "next-themes"
import { BookOpenCheck, Building2, Clapperboard, HardHat, Landmark, MonitorPlay, Moon, Receipt, ShieldCheck, Sun, Waypoints } from "lucide-react"
import { Dock } from "@/components/watermelon/dock"
import { PulseIsland } from "@/components/app/pulse-island"
import { SolarBackdrop } from "@/components/app/solar-backdrop"
import { Logo } from "@/components/app/logo"
import { useLive } from "@/components/app/providers"
import { DemoGuide } from "@/components/app/demo-guide"
import { CommandMenu } from "@/components/app/command-menu"
import { useEmbed } from "@/lib/url-flags"

const GROUPS = [
  [
    { id: "story", label: "Project story · full demo", href: "/story", Icon: Clapperboard },
    { id: "flow", label: "Payment flow", href: "/", Icon: Waypoints },
    { id: "live", label: "Live · run it step by step", href: "/live", Icon: MonitorPlay },
    { id: "bills", label: "Bills", href: "/bills", Icon: Receipt },
  ],
  [
    { id: "agency", label: "Agency room", href: "/agency", Icon: Landmark },
    { id: "prime", label: "Prime contractor room", href: "/prime", Icon: Building2 },
    { id: "sub", label: "Subcontractor room", href: "/sub", Icon: HardHat },
  ],
  [
    { id: "vendors", label: "Vendor checks", href: "/answer-key", Icon: ShieldCheck },
    { id: "ledger", label: "Ledger", href: "/ledger", Icon: BookOpenCheck },
  ],
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="glass grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <motion.span key={dark ? "moon" : "sun"} initial={{ rotate: -60, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}>
        {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </motion.span>
    </button>
  )
}

function ProjectLabel() {
  const live = useLive()
  const project = live.contracts.find(c => c.kind === "PRIME_CONTRACT")?.title
  return <span className="hidden truncate text-xs text-muted-foreground lg:block">{project ?? "Public works"} · Base Sepolia</span>
}

function AnimatedPage({ children }: { children: ReactNode }) {
  const path = usePathname()
  return (
    <motion.main
      key={path}
      initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-6xl px-4 pt-6 pb-36 md:px-8"
    >
      {children}
    </motion.main>
  )
}

// The dock floats over every page except Live, which is a full workspace (⌘K still navigates).
function DockSlot() {
  const path = usePathname()
  if (path.startsWith("/live")) return null
  return (
    <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <Dock groups={GROUPS} />
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const embed = useEmbed()
  if (embed)
    return (
      <div className="relative min-h-svh">
        <SolarBackdrop />
        <main className="w-full px-4 pt-4 pb-10">{children}</main>
      </div>
    )
  return (
    <div className="relative min-h-svh">
      <SolarBackdrop />
      <header className="sticky top-0 z-30 px-4 pt-3 pb-4 md:px-8">
        {/* Frosted backing on its own layer so the pulse island's dropdown isn't masked. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-background/90 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_88%,transparent)]" />
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-start gap-3">
          <Link href="/" className="flex items-center gap-2.5 justify-self-start pt-1">
            <Logo className="size-8" />
            <span className="grid leading-none">
              <span className="text-lg font-semibold tracking-tight">GovFlow</span>
              <ProjectLabel />
            </span>
          </Link>
          <div className="h-10 w-[300px] max-sm:w-[220px]">
            <PulseIsland />
          </div>
          <div className="flex items-center gap-2 justify-self-end">
            <CommandMenu />
            <DemoGuide />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <Suspense fallback={<main className="mx-auto max-w-6xl px-4 pt-6 md:px-8">{children}</main>}>
        <AnimatedPage>{children}</AnimatedPage>
      </Suspense>
      <Suspense fallback={null}>
        <DockSlot />
      </Suspense>
    </div>
  )
}
