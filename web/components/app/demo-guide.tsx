"use client"

/**
 * Demo guide: a side panel with the live demo script for each level. Every step says who does it, offers one-click "sign in as" that switches persona and opens the right page, and ticks itself off as the database changes. Ends with a link to the verification view.
 *
 * Inputs:
 * - Live rows, personas
 *
 * Outputs:
 * - A "Demo" button that opens the script panel
 */

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Check, Clapperboard, LogIn, Play, ShieldCheck, Snowflake, Zap } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useLive, usePersonas } from "@/components/app/providers"
import { demoScript, type DemoStep } from "@/lib/demo-script"
import { fmtUsdc, titleCase } from "@/lib/format"
import { cn } from "@/lib/utils"

const LEVELS = [
  { id: "gov", label: "Agency → Prime" },
  { id: "sub", label: "Prime → Sub" },
] as const

export function DemoGuide() {
  const live = useLive()
  const router = useRouter()
  const { personas, persona, setPersona } = usePersonas()
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState<"gov" | "sub">("gov")
  const script = demoScript(live, level)
  const nameOf = (key: string) => titleCase(personas.find(p => p.key === key)?.name ?? key).split(" ")[0]

  const go = (s: DemoStep, personaKey?: string) => {
    if (personaKey && personaKey !== persona.key) setPersona(personaKey)
    if (s.where) router.push(s.where)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="glass inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors hover:text-primary">
        <Clapperboard className="size-4" />
        <span className="hidden sm:inline">Demo</span>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-2">
          <SheetTitle className="font-display text-2xl">Demo script</SheetTitle>
          <SheetDescription>Follow the steps in order. Each one ticks off by itself when it happens.</SheetDescription>
        </SheetHeader>

        <div className="px-4">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            {LEVELS.map(l => (
              <button
                key={l.id}
                onClick={() => setLevel(l.id)}
                className={cn("rounded-full py-1.5 text-sm font-medium transition-colors", level === l.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {l.label}
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {script.contract ? (
              <>
                <span className="font-medium text-foreground">{script.contract.title}</span>
                {script.milestone ? ` · line ${script.milestone.lineNo}, up to ${fmtUsdc(script.milestone.scheduledValue)}` : ""}
                {script.invoice ? ` · bill #${script.invoice.id}` : ""}
              </>
            ) : (
              "No contract visible. Sign in as the observer."
            )}
          </p>

          {script.finished ? (
            <div className="mt-4 rounded-2xl bg-secondary/60 p-4 text-sm">
              <p className="font-medium">Every line on this contract is paid.</p>
              <p className="mt-1 text-muted-foreground">Reseed the database for a fresh run, or replay the last bill.</p>
              {script.lastPaid ? (
                <button onClick={() => go({ where: `/verify/${script.lastPaid!.id}` } as DemoStep)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  <ShieldCheck className="size-4" /> Replay verification
                </button>
              ) : null}
            </div>
          ) : (
            <ol className="relative mt-4 space-y-2 pb-6">
              {script.steps.map((s, i) => (
                <li
                  key={s.key}
                  className={cn(
                    "rounded-2xl border p-3 transition-colors",
                    s.status === "next" && "border-primary/50 bg-primary/5",
                    s.status === "blocked" && "border-destructive/40 bg-destructive/5",
                    s.status === "done" && "border-transparent bg-muted/40",
                    s.status === "waiting" && "border-transparent opacity-60"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                        s.status === "done" && "bg-leaf text-background",
                        s.status === "next" && "bg-primary text-primary-foreground",
                        s.status === "blocked" && "bg-destructive text-background",
                        s.status === "waiting" && "bg-muted text-muted-foreground"
                      )}
                    >
                      {s.status === "done" ? <Check className="size-3.5" strokeWidth={3} /> : s.status === "blocked" ? <Snowflake className="size-3.5" /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", s.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/40")}>{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.hint}</p>
                      {s.status !== "done" ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {s.auto ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sun/25 px-2 py-0.5 text-[11px] font-medium">
                              <Zap className="size-3" /> Automatic
                            </span>
                          ) : null}
                          {s.who?.map(w => (
                            <button
                              key={w.persona}
                              onClick={() => go(s, w.persona)}
                              disabled={s.status === "waiting"}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:pointer-events-none",
                                persona.key === w.persona ? "bg-primary text-primary-foreground" : "bg-background ring-1 ring-border hover:ring-primary"
                              )}
                            >
                              <LogIn className="size-3" /> {persona.key === w.persona ? `Signed in as ${nameOf(w.persona)}` : `Sign in as ${nameOf(w.persona)}`}
                              <span className="opacity-60">· {w.label}</span>
                            </button>
                          ))}
                          {s.auto && s.where && s.status !== "waiting" ? (
                            <button onClick={() => go(s)} className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[11px] font-medium ring-1 ring-border hover:ring-primary">
                              <Play className="size-3" /> Watch
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
