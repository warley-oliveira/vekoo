import { useCallback, useEffect, useRef, useState } from "react"
import { Navigate, useLocation, useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AiBar } from "@/components/editor/ai-bar"
import { AiProvider, useAi } from "@/components/editor/ai-store"
import { BlockBar } from "@/components/editor/block-bar"
import { useCardActions } from "@/components/editor/card-actions"
import { CardCanvas } from "@/components/editor/card-canvas"
import {
  activeCard,
  EditorProvider,
  useEditor,
} from "@/components/editor/editor-store"
import { EditorTopbar } from "@/components/editor/editor-topbar"
import { FormatBar } from "@/components/editor/format-bar"
import { MobileToolbar } from "@/components/editor/mobile-toolbar"
import { PropertiesPanel } from "@/components/editor/properties-panel"
import { ShortcutsDialog } from "@/components/editor/shortcuts-dialog"
import { MobileTrail, Trail } from "@/components/editor/trail"
import { duplicateBlock, type Block } from "@/lib/doc"
import { newId, useStore } from "@/lib/store"

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
      <AiProvider>
        <EditorShell />
      </AiProvider>
    </EditorProvider>
  )
}

function EditorShell() {
  const location = useLocation()
  const { runCarousel } = useAi()
  const [aiOpen, setAiOpen] = useState(false)
  const kicked = useRef(false)

  // Vindo de "descrever o assunto", o editor já abre gerando.
  const pending = (location.state as { generate?: string } | null)?.generate
  useEffect(() => {
    if (!pending || kicked.current) return
    kicked.current = true
    window.history.replaceState({}, "")
    void runCarousel(pending)
  }, [pending, runCarousel])

  const toggleAi = useCallback(() => setAiOpen((open) => !open), [])

  return (
    <>
      <EditorHotkeys onToggleAi={toggleAi} />
      <div className="flex h-dvh flex-col bg-background">
        <EditorTopbar onOpenAi={() => setAiOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <Trail />
          <CardCanvas />
          <PropertiesPanel />
          <BlockBar />
        </div>
        <MobileTrail />
        <MobileToolbar />
      </div>
      {/* Flutuantes: não ocupam altura do editor. */}
      <AiBar open={aiOpen} onOpenChange={setAiOpen} />
      <FormatBar />
      <ShortcutsDialog />
    </>
  )
}

/**
 * Atalhos com modificador — ⌘Z desfaz, ⇧⌘Z refaz, ⌘J abre a geração,
 * ⌘C/⌘V copiam e colam bloco, ⌘D duplica (o bloco
 * selecionado ou, sem seleção, o card), ⌘⌫ exclui o card e ⇧⌘↑/↓ o move.
 * Tudo fora de campos de texto: lá as teclas pertencem ao texto.
 */
function EditorHotkeys({ onToggleAi }: { onToggleAi: () => void }) {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const actions = useCardActions()
  /** Área de transferência do editor — em memória, não é a do sistema. */
  const clipboard = useRef<Block | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable=true]")) return

      const card = activeCard(state)
      const key = e.key.toLowerCase()

      if (key === "z") {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? "history/redo" : "history/undo" })
        return
      }
      if (key === "j") {
        e.preventDefault()
        onToggleAi()
        return
      }
      if (!card) return

      const index = card.blocks.findIndex((b) => b.id === state.selection.blockId)
      const block = index >= 0 ? card.blocks[index] : undefined

      if (key === "d") {
        e.preventDefault()
        if (block) {
          dispatch({
            type: "block/insert",
            index: index + 1,
            block: duplicateBlock(block, () => newId("block")),
          })
        } else {
          actions.duplicate(card.id)
        }
        return
      }
      if (key === "c" && block) {
        e.preventDefault()
        clipboard.current = block
        toast(t("editor.clipboard.copiedToast"))
        return
      }
      if (key === "v" && clipboard.current) {
        e.preventDefault()
        dispatch({
          type: "block/insert",
          index: index >= 0 ? index + 1 : card.blocks.length,
          block: duplicateBlock(clipboard.current, () => newId("block")),
        })
        return
      }
      if (key === "backspace" || key === "delete") {
        e.preventDefault()
        actions.remove(card.id)
        return
      }
      if (e.shiftKey && (key === "arrowup" || key === "arrowdown")) {
        e.preventDefault()
        actions.move(card.id, key === "arrowup" ? -1 : 1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [actions, dispatch, onToggleAi, state])

  return null
}

function MissingCarousel() {
  const { t } = useTranslation()

  useEffect(() => {
    toast(t("editor.notFoundToast"))
  }, [t])

  return <Navigate to="/" replace />
}
