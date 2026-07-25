import { useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  Palette,
  Redo2,
  Undo2,
} from "lucide-react"
import { toast } from "sonner"

import { useEditor } from "@/components/editor/editor-store"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

// Topo do editor: voltar, nome editável no lugar, indicador de salvo,
// desfazer/refazer e as ações que ainda são vitrine (visualizar, exportar,
// marca) — visíveis desde já, cada uma respondendo com um aviso honesto.

export function EditorTopbar() {
  const { t } = useTranslation()
  const { state, dispatch, saveState, folderId } = useEditor()

  const backTo = folderId ? `/folders/${folderId}` : "/"

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
      <Button
        variant="ghost"
        size="icon-sm"
        nativeButton={false}
        render={<Link to={backTo} aria-label={t("editor.topbar.backAria")} />}
      >
        <ArrowLeft />
      </Button>

      <TitleField />

      <span
        role="status"
        className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex"
      >
        {saveState === "saving" ? (
          t("editor.topbar.saving")
        ) : (
          <>
            <Check className="size-3.5" />
            {t("editor.topbar.saved")}
          </>
        )}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="hidden text-muted-foreground md:flex"
          onClick={() => toast(t("editor.topbar.brandToast"))}
        >
          <Palette />
          {t("editor.topbar.brand")}
        </Button>

        <Separator orientation="vertical" className="mx-1 hidden !h-5 md:block" />

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("editor.topbar.undo")}
          disabled={state.past.length === 0}
          onClick={() => dispatch({ type: "history/undo" })}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("editor.topbar.redo")}
          disabled={state.future.length === 0}
          onClick={() => dispatch({ type: "history/redo" })}
        >
          <Redo2 />
        </Button>

        <Separator orientation="vertical" className="mx-1 !h-5" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast(t("editor.topbar.previewToast"))}
        >
          <Eye />
          <span className="hidden sm:inline">{t("editor.topbar.preview")}</span>
        </Button>
        <Button size="sm" onClick={() => toast(t("editor.topbar.exportToast"))}>
          <Download />
          <span className="hidden sm:inline">{t("editor.topbar.export")}</span>
        </Button>
      </div>
    </header>
  )
}

function TitleField() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  function start() {
    setDraft(state.doc.title)
    setEditing(true)
  }

  function commit() {
    dispatch({ type: "title/set", title: draft })
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") setEditing(false)
        }}
        aria-label={t("editor.topbar.titleAria")}
        placeholder={t("editor.topbar.titlePlaceholder")}
        className={cn(
          "h-8 w-full max-w-72 min-w-0 rounded-md border bg-background px-2",
          "font-heading text-sm font-semibold outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/50"
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-label={t("editor.topbar.titleAria")}
      className={cn(
        "min-w-0 truncate rounded-md px-2 py-1.5 text-left font-heading text-sm font-semibold",
        "hover:bg-accent hover:text-accent-foreground",
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      )}
    >
      {state.doc.title}
    </button>
  )
}
