import { useEffect } from "react"
import { Navigate, useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { BlockBar } from "@/components/editor/block-bar"
import { CardCanvas } from "@/components/editor/card-canvas"
import { EditorProvider, useEditor } from "@/components/editor/editor-store"
import { EditorTopbar } from "@/components/editor/editor-topbar"
import { PropertiesPanel } from "@/components/editor/properties-panel"
import { MobileTrail, Trail } from "@/components/editor/trail"
import { useStore } from "@/lib/store"

// O editor vive fora do AppShell de propósito: tela cheia, topo próprio,
// nada competindo com o card. Três zonas: trilha, canvas e barra de blocos
// (com o painel de propriedades entre canvas e barra quando há seleção).

export function EditorPage() {
  const { carouselId } = useParams()
  const { state } = useStore()

  const carousel = state.carousels.find(
    (c) => c.id === carouselId && c.trashedAt === null
  )

  if (!carousel) return <MissingCarousel />

  return (
    <EditorProvider key={carousel.id} carousel={carousel}>
      <EditorHotkeys />
      <div className="flex h-dvh flex-col bg-background">
        <EditorTopbar />
        <div className="flex min-h-0 flex-1">
          <Trail />
          <CardCanvas />
          <PropertiesPanel />
          <BlockBar />
        </div>
        <MobileTrail />
      </div>
    </EditorProvider>
  )
}

/** Cmd/Ctrl+Z desfaz, Shift+Cmd/Ctrl+Z refaz — fora de campos de texto. */
function EditorHotkeys() {
  const { dispatch } = useEditor()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable=true]")) return
      e.preventDefault()
      dispatch({ type: e.shiftKey ? "history/redo" : "history/undo" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dispatch])

  return null
}

function MissingCarousel() {
  const { t } = useTranslation()

  useEffect(() => {
    toast(t("editor.notFoundToast"))
  }, [t])

  return <Navigate to="/" replace />
}
