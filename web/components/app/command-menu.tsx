"use client"

/**
 * ⌘K command palette (shadcn/ui command): jump to any screen, open a bill or its verification, switch who you're signed in as, or start the full demo on the Live screen.
 *
 * Inputs:
 * - Live bills, personas, keyboard (⌘K / Ctrl+K)
 *
 * Outputs:
 * - A trigger pill for the top bar and the palette dialog
 */

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { BookOpenCheck, Building2, Eye, HardHat, Landmark, MonitorPlay, Play, Receipt, Search, ShieldCheck, User, Waypoints } from "lucide-react"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { useLive, usePersonas } from "@/components/app/providers"
import { orgName } from "@/lib/domain"
import { fmtUsdc, kindLabel, titleCase, docNo } from "@/lib/format"

const PAGES = [
  { label: "Payment flow", href: "/", icon: Waypoints },
  { label: "Live · run it step by step", href: "/live", icon: MonitorPlay },
  { label: "Bills", href: "/bills", icon: Receipt },
  { label: "Agency room", href: "/agency", icon: Landmark },
  { label: "Prime contractor room", href: "/prime", icon: Building2 },
  { label: "Subcontractor room", href: "/sub", icon: HardHat },
  { label: "Vendor checks", href: "/answer-key", icon: ShieldCheck },
  { label: "Ledger", href: "/ledger", icon: BookOpenCheck },
]

export function CommandMenu() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const live = useLive()
  const { personas, setPersona } = usePersonas()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }
  const bills = [...live.invoices].sort((a, b) => (a.id > b.id ? -1 : 1)).slice(0, 8)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="glass hidden h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
        aria-label="Open command palette"
      >
        <Search className="size-4" />
        <Kbd>⌘K</Kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="GovFlow" description="Jump anywhere, open a bill, or switch person">
        <Command>
          <CommandInput placeholder="Go to a screen, a bill, or a person…" />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup heading="Demo">
              <CommandItem onSelect={() => go("/story")}>
                <Play /> Replay the project story
              </CommandItem>
              <CommandItem onSelect={() => go("/story?run=1")}>
                <Play /> Run the full demo live
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Screens">
              {PAGES.map(p => (
                <CommandItem key={p.href} onSelect={() => go(p.href)}>
                  <p.icon /> {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {bills.length ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Bills">
                  {bills.map(b => (
                    <CommandItem key={String(b.id)} value={`bill ${b.id} ${kindLabel[b.kind]} ${orgName(live, b.payeeOrgId)}`} onSelect={() => go(`/verify/${b.id}`)}>
                      <ShieldCheck />
                      <span className="flex-1 truncate">
                        Verify {docNo(b)} · {titleCase(orgName(live, b.payeeOrgId))}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">{fmtUsdc(b.amount)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
            <CommandSeparator />
            <CommandGroup heading="View as">
              {personas.map(p => (
                <CommandItem
                  key={p.key}
                  value={`as ${p.name} ${p.title}`}
                  onSelect={() => {
                    setPersona(p.key)
                    setOpen(false)
                  }}
                >
                  {p.observer ? <Eye /> : <User />} {titleCase(p.name)} <span className="text-xs text-muted-foreground">· {p.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
