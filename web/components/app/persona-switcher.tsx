"use client"

/**
 * "Viewing as" pill: switch between the seeded demo people and the read-only observer. Switching reconnects to the database as that person, so every screen shows exactly what they may see.
 *
 * Inputs:
 * - personas from /api/personas, the current persona, organizations (for grouping)
 *
 * Outputs:
 * - A dropdown that calls setPersona(key)
 */

import { Check, ChevronDown, Eye } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLive, usePersonas } from "@/components/app/providers"
import { orgHue, titleCase } from "@/lib/format"

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

export function PersonaSwitcher() {
  const { personas, persona, setPersona } = usePersonas()
  const live = useLive()
  const orgOf = (orgId: string | null) =>
    orgId ? titleCase(live.organizations.find(o => String(o.id) === orgId)?.name ?? `Org ${orgId}`) : "All rooms"

  const kindOf = (orgId: string | null) => live.organizations.find(o => String(o.id) === orgId)?.kind ?? ""
  const groups = new Map<string, typeof personas>()
  for (const p of personas) {
    const g = p.observer ? "Observer" : orgOf(p.orgId)
    groups.set(g, [...(groups.get(g) ?? []), p])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="glass flex h-10 items-center gap-2 rounded-full py-1 pr-3 pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-foreground"
          style={{ background: `linear-gradient(135deg, var(--sun), ${orgHue[kindOf(persona.orgId)]?.varName ?? "var(--leaf)"})` }}
        >
          {persona.observer ? <Eye className="size-4" /> : initials(persona.name)}
        </span>
        <span className="hidden min-w-0 leading-tight sm:grid">
          <span className="truncate text-[13px] font-medium">{titleCase(persona.name)}</span>
          <span className="truncate text-[11px] text-muted-foreground">{persona.title}</span>
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-2xl">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Viewing as</DropdownMenuLabel>
        {personas.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted-foreground">No demo logins found (seed/.demo-tokens.json).</p> : null}
        {[...groups.entries()].map(([group, list], gi) => (
          <DropdownMenuGroup key={group}>
            {gi > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">{group}</DropdownMenuLabel>
            {list.map(p => (
              <DropdownMenuItem key={p.key} onSelect={() => setPersona(p.key)} className="rounded-xl">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${orgHue[kindOf(p.orgId)]?.soft ?? "bg-muted"}`}>
                  {p.observer ? <Eye className="size-3.5" /> : initials(p.name)}
                </span>
                <span className="grid flex-1 leading-tight">
                  <span className="text-sm">{titleCase(p.name)}</span>
                  <span className="text-xs text-muted-foreground">{p.title}</span>
                </span>
                {p.key === persona.key ? <Check className="size-4" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
