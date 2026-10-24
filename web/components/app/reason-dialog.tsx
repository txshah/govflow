"use client"

/**
 * A button that opens a small dialog asking for a reason (or other short text), then runs the action. Used for every decision that the database requires a reason for.
 *
 * Inputs:
 * - trigger label/variant, title, description, optional placeholder and whether text is required
 *
 * Outputs:
 * - Calls onConfirm(text); closes when it resolves true
 */

import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

export function ReasonDialog({
  trigger,
  variant = "outline",
  title,
  description,
  placeholder = "Reason",
  confirmLabel = "Confirm",
  required = true,
  defaultValue = "",
  onConfirm,
}: {
  trigger: ReactNode
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost"
  title: string
  description?: string
  placeholder?: string
  confirmLabel?: string
  required?: boolean
  defaultValue?: string
  onConfirm: (text: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(defaultValue)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Textarea value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} rows={3} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={busy || (required && !text.trim())}
            onClick={async () => {
              setBusy(true)
              const ok = await onConfirm(text.trim())
              setBusy(false)
              if (ok) {
                setOpen(false)
                setText(defaultValue)
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
