"use client"

/**
 * The frame around every page: sunlit backdrop, a slim top bar (mark, project, the main tabs, search and day/night toggle) and the page with a soft fade-and-grow transition.
 *
 * Inputs:
 * - Current path, theme, live data
 *
 * Outputs:
 * - Backdrop + top bar + animated page
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { motion } from "motion/react"
import { useTheme } from "next-themes"
import { Building2, Clapperboard, Gavel, MonitorPlay, Moon, Receipt, Sun } from "lucide-react"
import { SolarBackdrop } from "@/components/app/solar-backdrop"
import { Logo } from "@/components/app/logo"
import { useLive } from "@/components/app/providers"
import { cn } from "@/lib/utils"
import { CommandMenu } from "@/components/app/command-menu"
import { useEmbed } from "@/lib/url-flags"

// The main tabs; everything else (payment flow, envelope, ledger, vendor checks…) is in ⌘K.
const TABS = [
  { label: "Live", href: "/live", Icon: MonitorPlay },
  { label: "Open tenders", href: "/tenders", Icon: Gavel },
  { label: "Bills", href: "/bills", Icon: Receipt },
  { label: "Rooms", href: "/rooms", Icon: Building2 },
  { label: "Story", href: "/story", Icon: Clapperboard },
]

function Tabs() {
  const path = usePathname()
  return (
    <nav className="flex items-center gap-0.5 rounded-xl border bg-card p-1 shadow-xs">
      {TABS.map(({ label, href, Icon }) => {
        const active = path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            <span className="max-md:hidden">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

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
      className="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 md:px-8"
    >
      {children}
    </motion.main>
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
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Link href="/live" className="flex items-center gap-2.5 justify-self-start">
            <Logo className="size-8" />
            <span className="grid leading-none">
              <span className="text-lg font-semibold tracking-tight">GovFlow</span>
              <ProjectLabel />
            </span>
          </Link>
          <Suspense fallback={null}>
            <Tabs />
          </Suspense>
          <div className="flex items-center gap-2 justify-self-end">
            <CommandMenu />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <Suspense fallback={<main className="mx-auto max-w-6xl px-4 pt-6 md:px-8">{children}</main>}>
        <AnimatedPage>{children}</AnimatedPage>
      </Suspense>
    </div>
  )
}
