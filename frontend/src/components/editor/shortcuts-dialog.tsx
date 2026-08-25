import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// A lista de atalhos, aberta por "?" — o editor tem muitos, e um editor que
// não conta os seus atalhos só é rápido para quem os descobriu por acaso.

type Group = { title: string; rows: ReadonlyArray<{ keys: string[]; id: string }> }

const GROUPS: ReadonlyArray<{ id: string; rows: Group["rows"] }> = [
  {
    id: "cards",
    rows: [
      { id: "nextCard", keys: ["↓"] },
      { id: "previousCard", keys: ["↑"] },
      { id: "moveCard", keys: ["⇧", "⌘", "↑/↓"] },
      { id: "duplicate", keys: ["⌘", "D"] },
      { id: "removeCard", keys: ["⌘", "⌫"] },
    ],
  },
  {
    id: "blocks",
    rows: [
      { id: "selectBlock", keys: ["Tab"] },
      { id: "editBlock", keys: ["Enter"] },
      { id: "leaveBlock", keys: ["Esc"] },
      { id: "moveBlock", keys: ["Alt", "↑/↓"] },
      { id: "removeBlock", keys: ["Delete"] },
      { id: "copyPaste", keys: ["⌘", "C / V"] },
      { id: "slash", keys: ["/"] },
    ],
  },
  {
    id: "document",
    rows: [
      { id: "undo", keys: ["⌘", "Z"] },
      { id: "redo", keys: ["⇧", "⌘", "Z"] },
      { id: "generate", keys: ["⌘", "J"] },
      { id: "shortcuts", keys: ["?"] },
    ],
  },
]

export function ShortcutsDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "?" || e.metaKey || e.ctrlKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable=true]")) return
      e.preventDefault()
      setOpen((current) => !current)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {t("editor.shortcuts.title")}
          </DialogTitle>
          <DialogDescription>
            {t("editor.shortcuts.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {GROUPS.map((group) => (
            <section key={group.id} className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">
                {t(`editor.shortcuts.groups.${group.id}`)}
              </h3>
              <dl className="divide-y">
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-4 py-1.5"
                  >
                    <dt className="text-sm">
                      {t(`editor.shortcuts.actions.${row.id}`)}
                    </dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {row.keys.map((key, i) => (
                        <Key key={i}>{key}</Key>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Key({ children }: { children: string }) {
  return (
    <kbd
      className={cn(
        "rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] leading-none",
        "text-muted-foreground"
      )}
    >
      {children}
    </kbd>
  )
}
