"use client"

/**
 * Story mode: the project told one scene at a time, full screen, no scrolling. Replay walks through what already happened; Run live clears the screen and does every step for real (both levels), moving to each scene as its event lands. Chapters along the bottom; ← → to move, space to pause.
 *
 * Inputs:
 * - Live rows (best as the observer), demo personas, ?run=1 to start a live run on open
 *
 * Outputs:
 * - A full-screen overlay with the current scene, chapter rail and controls
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, Radio, ShieldCheck, TriangleAlert, X } from "lucide-react"
import { useLive, usePersonas } from "@/components/app/providers"
import { SolarBackdrop } from "@/components/app/solar-backdrop"
import { SCENES } from "@/components/story/scenes"
import { buildStory } from "@/lib/story"
import { useDirector, type Phase } from "@/lib/director"
import { cn } from "@/lib/utils"

const noop = () => () => {}
// The first two slides (problem, solution) come before the live run.
const PHASE_INDEX: Record<Phase, number> = { issue: 2, screen: 3, pick: 4, papers: 5, award: 6, pay1: 7, plan: 8, pay2: 9, done: 10 }

export default function StoryPage() {
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const live = useLive()
  const router = useRouter()
  const { personas } = usePersonas()
  const liveRef = useRef(live)
  useEffect(() => {
    liveRef.current = live
  }, [live])
  const getLive = useCallback(() => liveRef.current, [])
  const director = useDirector(getLive, personas)
  const [manualIndex, setManualIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [liveMode, setLiveMode] = useState(false)

  const index = liveMode && director.phase ? PHASE_INDEX[director.phase] : manualIndex
  const story = useMemo(() => buildStory(live, liveMode ? director.ids : {}), [live, liveMode, director.ids])
  const scene = SCENES[index]

  // Replay: advance on a timer per scene.
  useEffect(() => {
    if (liveMode || !playing) return
    if (index >= SCENES.length - 1) return
    const t = setTimeout(() => setManualIndex(i => Math.min(SCENES.length - 1, i + 1)), scene.secs * 1000)
    return () => clearTimeout(t)
  }, [index, playing, liveMode, scene.secs])

  const startLive = useCallback(async () => {
    setLiveMode(true)
    setPlaying(false)
    await director.run()
  }, [director])

  // ?run=1 (from the Live screen) starts a live run once personas are loaded. The ref keeps the
  // latest startLive without re-running this effect (which would cancel the pending start).
  const startLiveRef = useRef(startLive)
  useEffect(() => {
    startLiveRef.current = startLive
  }, [startLive])
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current || !personas.length || !live.ready) return
    if (new URLSearchParams(window.location.search).get("run") === "1") {
      startedRef.current = true
      setTimeout(() => void startLiveRef.current(), 0)
    }
  }, [personas.length, live.ready])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/")
      if (liveMode && director.running) return
      if (e.key === "ArrowRight") setManualIndex(i => Math.min(SCENES.length - 1, i + 1))
      if (e.key === "ArrowLeft") setManualIndex(i => Math.max(0, i - 1))
      if (e.key === " ") {
        // Space would also "click" a focused button and toggle twice.
        e.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.blur()
        setPlaying(p => !p)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router, liveMode, director.running])

  if (!mounted) return null
  const Scene = scene.render
  const go = (i: number) => {
    if (liveMode && director.running) return
    setLiveMode(false)
    setManualIndex(i)
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background text-foreground">
      <SolarBackdrop />

      <header className="relative z-10 flex items-center gap-3 px-6 pt-5 md:px-10">
        <span className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">GovFlow · Project story</span>
        {liveMode ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-[11px] font-semibold text-destructive">
            <Radio className="size-3" /> LIVE
          </span>
        ) : null}
        {liveMode && director.note ? (
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs">
            {director.running ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {director.note}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {scene.key === "done" && (story.bill1 ?? story.bill2) ? (
            <Link href={`/verify/${(story.bill1 ?? story.bill2)!.id}`} className="glass inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium hover:text-primary">
              <ShieldCheck className="size-4" /> Watch a verification
            </Link>
          ) : null}
          {!director.running ? (
            <button
              onClick={startLive}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              title="Runs every step for real on the shared database"
            >
              <Radio className="size-4" /> Run live
            </button>
          ) : (
            <button onClick={director.stop} className="glass inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium">
              Stop
            </button>
          )}
          <Link href="/" className="glass grid size-9 place-items-center rounded-full" aria-label="Exit story">
            <X className="size-4" />
          </Link>
        </div>
      </header>

      {director.error ? (
        <div className="relative z-10 mx-auto mt-3 flex max-w-2xl items-center gap-2 rounded-full bg-destructive/12 px-4 py-2 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" /> {director.error}
        </div>
      ) : null}

      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-6 md:px-10">
        <AnimatePresence mode="wait">
          <motion.section
            key={scene.key}
            initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -24, filter: "blur(8px)" }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            <Scene s={story} live={live} />
          </motion.section>
        </AnimatePresence>
      </main>

      {/* Chapter rail */}
      <footer className="relative z-10 px-6 pb-6 md:px-10">
        <div className="glass mx-auto flex max-w-5xl items-center gap-3 rounded-full px-3 py-2">
          <button onClick={() => go(Math.max(0, index - 1))} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-muted" aria-label="Previous scene">
            <ChevronLeft className="size-4" />
          </button>
          {!liveMode ? (
            <button onClick={() => setPlaying(p => !p)} className="grid size-8 shrink-0 place-items-center rounded-full bg-muted" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
          ) : null}
          <ol className="flex min-w-0 flex-1 items-center gap-1">
            {SCENES.map((sc, i) => (
              <li key={sc.key} className="min-w-0 flex-1">
                <button onClick={() => go(i)} className="group flex w-full flex-col gap-1 px-1 py-1 text-left" title={sc.chapter}>
                  <span className="relative h-1 overflow-hidden rounded-full bg-border">
                    {i < index ? <span className="absolute inset-0 bg-leaf" /> : null}
                    {i === index ? (
                      <motion.span
                        key={`${index}-${playing}-${liveMode}`}
                        className="absolute inset-y-0 left-0 bg-primary"
                        initial={{ width: liveMode || !playing ? "100%" : "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: liveMode || !playing ? 0 : sc.secs, ease: "linear" }}
                      />
                    ) : null}
                  </span>
                  <span className={cn("hidden truncate text-[11px] md:block", i === index ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{sc.chapter}</span>
                </button>
              </li>
            ))}
          </ol>
          <button onClick={() => go(Math.min(SCENES.length - 1, index + 1))} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-muted" aria-label="Next scene">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </footer>
    </div>,
    document.body
  )
}
