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
import { ErrorState } from "@/components/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useCarousel } from "@/hooks/use-carousels"
import { ApiError } from "@/lib/api"
import { duplicateBlock, newId, type Block } from "@/lib/doc"

// O editor vive fora do AppShell de propósito: tela cheia, topo próprio,
// nada competindo com o card. Três zonas: trilha, canvas e barra de blocos
// (com o painel de propriedades entre canvas e barra quando há seleção).

export function EditorPage() {
  const { carouselId } = useParams()
  // Aqui vem o documento **inteiro** (`GET /carousels/:id`); a biblioteca só
  // recebe o resumo, com o card 1.
  const { carousel, isLoading, error, reload } = useCarousel(carouselId)

  if (isLoading && !carousel) return <EditorSkeleton />
  // Carrossel que não existe (ou é de outra organização) é 404 — tela própria.
  // Qualquer outro erro é falha de leitura, e falha de leitura se tenta de novo.
  if (error instanceof ApiError && error.code === "notFound") return <MissingCarousel />
  if (error || !carousel) return <EditorLoadError error={error} onRetry={reload} />

  return (
    <EditorProvider key={carousel.id} carousel={carousel}>
      <AiProvider>
        <EditorShell />
      </AiProvider>
    </EditorProvider>
  )
}

/** A moldura do editor enquanto o documento não chegou. */
function EditorSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-background" aria-hidden>
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-8 w-24" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-36 shrink-0 flex-col gap-2 border-r p-3 md:flex">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-none" />
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <Skeleton className="aspect-[4/5] h-full max-h-[70vh] rounded-none" />
        </div>
      </div>
    </div>
  )
}

function EditorLoadError({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <ErrorState
        error={error}
        title={t("editor.loadErrorTitle")}
        description={t("editor.loadErrorDescription")}
        onRetry={onRetry}
      />
    </div>
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
