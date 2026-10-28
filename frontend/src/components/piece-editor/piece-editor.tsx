import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ChevronLeft, ChevronRight, Images, Loader2, RotateCcw } from "lucide-react"

import { DocumentRenders } from "@/components/pieces/document-renders"
import { EditorPanel } from "@/components/piece-editor/editor-panel"
import { editorReducer, initialState, type EditorAction, type EditorState } from "@/components/piece-editor/editor-state"
import { useFreeMove } from "@/components/piece-editor/free-move"
import { SlideColumn } from "@/components/piece-editor/slide-column"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ImagePickerSheet } from "@/components/piece-editor/image-picker-sheet"
import { ErrorState } from "@/components/error-state"
import { PieceSlide, type SlideInteraction } from "@/components/piece-render/piece-slide"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandCore } from "@/hooks/use-brand-core"
import { usePieceEditorData, usePieceEditorSave } from "@/hooks/use-piece-editor"
import { ApiError } from "@/lib/api"
import { useActiveBrand } from "@/lib/brand-context"
import type { BrandAsset } from "@/lib/brand-core"
import type { Piece } from "@/lib/engines"
import { CAROUSEL_MAX, CAROUSEL_MIN, type FocalPoint, type ImageBlock, type Slide } from "@/lib/piece-document"
import { duplicateSlide, type Contracts, type Operation } from "@/lib/piece-operations"
import { useRenderFonts, type RenderAsset, type RenderLayout, type RenderPayload } from "@/lib/piece-render"
import { cn } from "@/lib/utils"

/** Espera depois da última alteração para gravar — o mesmo ritmo do brandcore. */
const AUTOSAVE_MS = 800

/**
 * O editor de uma peça-documento. A peça gerada abre direto aqui: não existe
 * "visualizar" separado — o editor é a visualização.
 *
 * Princípio: quem edita mexe em **conteúdo e estrutura** (texto, foto,
 * layout), nunca no desenho — fonte, cor exata, espaçamento e logo vêm do
 * brandcore publicado. É isso que mantém a peça no padrão depois de editada.
 */
export function PieceEditor({ piece }: { piece: Piece }) {
  const { brandId } = useActiveBrand()
  const { payload, layouts, isLoading, error, reload } = usePieceEditorData(brandId, piece.id)
  const fontsReady = useRenderFonts(payload?.theme)

  if (error && !payload) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  // Nada de desenhar com a fonte de reserva: espera as da marca.
  if (isLoading || !payload || !layouts || !fontsReady) return <EditorSkeleton format={piece.format} />

  return <EditorWorkspace piece={piece} payload={payload} layouts={layouts} />
}

function EditorWorkspace({ piece, payload, layouts }: { piece: Piece; payload: RenderPayload; layouts: RenderLayout[] }) {
  const { t } = useTranslation()
  const { brandId, path } = useActiveBrand()
  const { brandCore } = useBrandCore(brandId)
  const { saveDocument } = usePieceEditorSave(brandId, piece.id)
  const [pickerSlot, setPickerSlot] = useState<string | null>(null)
  const [rendersOpen, setRendersOpen] = useState(false)

  // Os contratos da biblioteca + os do próprio documento (um layout que saiu
  // do formato continua desenhável).
  const contracts: Contracts = useMemo(
    () => new Map([...payload.layouts, ...layouts].map((layout) => [layout.id, layout])),
    [payload.layouts, layouts]
  )
  const reducer = useMemo(() => editorReducer(contracts), [contracts])
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(payload.document, payload.versionId))

  const slide = state.document.slides.find((s) => s.id === state.selection.slideId) ?? state.document.slides[0]
  const layout = contracts.get(slide.layoutId) as RenderLayout

  // As fotos da marca (para trocar) e as que o documento já usa.
  const photos = useMemo(() => new Map((brandCore?.assets ?? []).filter((a) => a.kind === "photo").map((a) => [a.id, a])), [brandCore])
  const assets = useMemo(() => {
    const map: Record<string, RenderAsset> = { ...payload.assets }
    for (const photo of photos.values()) map[photo.id] = { url: photo.url, width: photo.width, height: photo.height }
    return map
  }, [payload.assets, photos])

  const apply = useCallback(
    (operations: Operation[], group?: string) => dispatch({ type: "apply", operations, group, now: Date.now() }),
    []
  )

  useAutosave(state, dispatch, saveDocument)

  /* ---------- carrossel ---------- */

  const isCarousel = state.document.format === "carousel"
  const slides = state.document.slides
  const activeIndex = slides.findIndex((s) => s.id === slide.id)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const fixed = useCallback((s: Slide) => Boolean(contracts.get(s.layoutId)?.position), [contracts])

  // O PNG mais recente de cada lâmina. Guarda o último conhecido: durante o
  // render da versão nova, a miniatura não pisca para a esquemática.
  const knownThumbs = useRef(new Map<string, string>())
  const thumbnails = useMemo(() => {
    const renders = piece.renders?.libvips ?? piece.renders?.react ?? []
    for (const render of renders) knownThumbs.current.set(render.slideId, render.url)
    return new Map(knownThumbs.current)
  }, [piece.renders])

  const goTo = useCallback((index: number) => {
    const target = slides[Math.min(Math.max(index, 0), slides.length - 1)]
    if (target) dispatch({ type: "select", slot: null, slideId: target.id })
  }, [slides])

  // A cópia entra logo depois da original — ou antes da chamada final, que
  // não sai do fim. Capa e chamada viram lâmina interna ao duplicar.
  const insertCopy = useCallback(
    (source: Slide, layoutId?: string) => {
      if (slides.length >= CAROUSEL_MAX) return
      const index = slides.findIndex((s) => s.id === source.id)
      const last = index === slides.length - 1 && fixed(source)
      const after = last ? slides[index - 1]?.id ?? null : source.id
      const copy = duplicateSlide(source, contracts, layoutId ?? (fixed(source) ? "carousel-body" : undefined))
      apply([{ op: "add_slide", afterSlideId: after, slide: copy }])
      dispatch({ type: "select", slot: null, slideId: copy.id })
    },
    [apply, contracts, fixed, slides]
  )

  const requestRemove = useCallback(
    (slideId: string) => {
      if (slides.length <= CAROUSEL_MIN) return
      const target = slides.find((s) => s.id === slideId)
      const hasText = target?.blocks.some((b) => b.type === "text" && b.content.trim() !== "")
      // Só pergunta quando há o que perder.
      if (hasText) setConfirmRemove(slideId)
      else apply([{ op: "remove_slide", slideId }])
    },
    [apply, slides]
  )

  useEditorShortcuts(state, dispatch, {
    carousel: isCarousel,
    previous: () => goTo(activeIndex - 1),
    next: () => goTo(activeIndex + 1),
    duplicate: () => insertCopy(slide),
    remove: () => requestRemove(slide.id),
  })

  const labels = useMemo(
    () => Object.fromEntries(layout.slots.map((s) => [s.id, t(`pieceEditor.slots.${s.id}`)])),
    [layout.slots, t]
  )

  const interaction: Omit<SlideInteraction, "scale"> = {
    selectedSlot: state.selection.slot,
    editingSlot: state.mode === "inline" ? state.selection.slot : null,
    focalSlot: state.mode === "focal" ? state.selection.slot : null,
    labels,
    onSelect: (slot) => dispatch({ type: "select", slot }),
    onEdit: (slot) => {
      dispatch({ type: "select", slot })
      dispatch({ type: "mode", mode: "inline" })
    },
    onText: (slot, text) => apply([{ op: "set_text", slideId: slide.id, slot, content: text }], `text:${slide.id}:${slot}`),
    onEndEdit: () => dispatch({ type: "mode", mode: "idle" }),
    onFocal: (slot, point: FocalPoint) => apply([{ op: "set_focal_point", slideId: slide.id, slot, focalPoint: point }], `focal:${slide.id}:${slot}`),
  }

  const pickerBlock = pickerSlot ? (slide.blocks.find((b) => b.slot === pickerSlot) as ImageBlock | undefined) : undefined

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-vk-border px-4 py-3 md:px-6">
        <Link
          to={path("/contents")}
          className="inline-flex h-10 items-center gap-1 rounded-md font-mono text-xs text-vk-fg outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-vk-fg/30"
        >
          {t("pieceEditor.back")}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-vk-muted">
            {t("pieceEditor.eyebrow")} · <span className="text-vk-fg">{piece.title}</span>
          </p>
        </div>
        <SaveIndicator state={state} onRetry={() => dispatch({ type: "retry" })} />
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-vk-border px-2.5 font-mono text-[11px]">
          <span className="size-1.5 rounded-full bg-vk-muted" aria-hidden /> {t("pieces.status.draft")}
        </span>
        <Button variant="outline" className="h-10 border-vk-border-strong bg-transparent" onClick={() => setRendersOpen(true)}>
          <Images aria-hidden /> {t("pieceEditor.renders")}
        </Button>
      </header>

      {state.save.status === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm md:px-6">
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
          <p className="min-w-0 flex-1">{t("pieceEditor.conflict")}</p>
          <Button size="sm" className="h-9" onClick={() => window.location.reload()}>
            <RotateCcw aria-hidden /> {t("pieceEditor.reload")}
          </Button>
        </div>
      )}

      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1",
          isCarousel ? "lg:grid-cols-[136px_minmax(0,1fr)_360px]" : "lg:grid-cols-[minmax(0,1fr)_360px]"
        )}
      >
        {isCarousel && (
          <aside className="hidden min-h-0 border-r border-vk-border lg:block">
            <SlideColumn
              document={state.document}
              activeSlideId={slide.id}
              layouts={contracts as Map<string, RenderLayout>}
              thumbnails={thumbnails}
              onSelect={(slideId) => dispatch({ type: "select", slot: null, slideId })}
              onReorder={(slideId, toIndex) => apply([{ op: "move_slide", slideId, toIndex }], "reorder")}
              onAdd={() => insertCopy(slide, "carousel-body")}
              onDuplicate={(slideId) => {
                const source = slides.find((s) => s.id === slideId)
                if (source) insertCopy(source)
              }}
              onRemove={requestRemove}
              onReorderStart={() => undefined}
              onReorderEnd={() => undefined}
            />
          </aside>
        )}
        <EditorPreview
          payload={payload}
          document={state.document}
          slide={slide}
          layout={layout}
          assets={assets}
          interaction={interaction}
          locked={state.mode !== "idle"}
          onApply={apply}
          pager={isCarousel ? { index: activeIndex, total: slides.length, goTo } : null}
          onBackground={() => dispatch({ type: "select", slot: null })}
        />
        <aside className="min-h-0 border-t border-vk-border bg-vk-bg lg:border-t-0 lg:border-l">
          <EditorPanel
            document={state.document}
            slide={slide}
            layout={layout}
            layouts={layouts}
            theme={payload.theme}
            photos={photos}
            selectedSlot={state.selection.slot}
            focalSlot={state.mode === "focal" ? state.selection.slot : null}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
            onApply={apply}
            onSelect={(slot) => dispatch({ type: "select", slot })}
            onUndo={() => dispatch({ type: "undo" })}
            onRedo={() => dispatch({ type: "redo" })}
            onPickImage={(slot) => setPickerSlot(slot)}
            onToggleFocal={(slot) => {
              dispatch({ type: "select", slot })
              dispatch({ type: "mode", mode: state.mode === "focal" && state.selection.slot === slot ? "idle" : "focal" })
            }}
          />
        </aside>
      </div>

      <AlertDialog open={confirmRemove !== null} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pieceEditor.slides.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pieceEditor.slides.removeBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmRemove) apply([{ op: "remove_slide", slideId: confirmRemove }])
                setConfirmRemove(null)
              }}
            >
              {t("pieceEditor.slides.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImagePickerSheet
        brandId={brandId}
        format={state.document.format}
        photos={[...photos.values()]}
        currentAssetId={pickerBlock?.assetId ?? null}
        open={pickerSlot !== null}
        onOpenChange={(open) => !open && setPickerSlot(null)}
        onPick={(asset: BrandAsset) => {
          if (pickerSlot) apply([{ op: "set_image", slideId: slide.id, slot: pickerSlot, assetId: asset.id, focalPoint: { x: 0.5, y: 0.5 } }])
        }}
      />

      <Sheet open={rendersOpen} onOpenChange={setRendersOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{t("pieceEditor.renders")}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <DocumentRenders piece={piece} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/* ---------- preview ---------- */

type EditorPreviewProps = {
  payload: RenderPayload
  document: RenderPayload["document"]
  slide: RenderPayload["document"]["slides"][number]
  layout: RenderLayout
  assets: Record<string, RenderAsset>
  interaction: Omit<SlideInteraction, "scale">
  /** Inline ou ponto focal: o arrasto livre fica parado. */
  locked: boolean
  onApply: (operations: Operation[], group?: string) => void
  /** Carrossel: as bolinhas de página e as setas embaixo do preview. */
  pager: { index: number; total: number; goTo: (index: number) => void } | null
  onBackground: () => void
}

/**
 * A lâmina ativa pelo mesmo componente do export, no tamanho lógico do
 * canvas e escalada por fora para caber. O que se vê é o que vai sair.
 */
function EditorPreview({ payload, document, slide, layout, assets, interaction, locked, onApply, pager, onBackground }: EditorPreviewProps) {
  const { t } = useTranslation()
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const { width, height } = document.canvas
  const move = useFreeMove({
    rootRef: canvas,
    document,
    slide,
    scale,
    selectedSlot: interaction.selectedSlot,
    locked,
    apply: onApply,
    select: interaction.onSelect,
  })

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const margin = 48
      const next = Math.min((entry.contentRect.width - margin) / width, (entry.contentRect.height - margin - 28) / height)
      setScale(Math.max(next, 0.1))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [width, height])

  return (
    <div
      ref={frame}
      className="relative flex min-h-[60vh] flex-col items-center justify-center gap-3 overflow-hidden bg-vk-faint p-6 lg:min-h-0"
      // Clicar no fundo tira a seleção — menos o clique que encerra um arrasto.
      onClick={() => !move.consumeClick() && onBackground()}
    >
      {scale > 0 && (
        <div style={{ width: width * scale, height: height * scale }} className="relative shadow-[0_1px_2px_rgba(10,10,10,0.06),0_12px_32px_rgba(10,10,10,0.10)]">
          <div ref={canvas} style={{ position: "relative", width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <PieceSlide
              document={document}
              slide={slide}
              index={document.slides.indexOf(slide)}
              theme={payload.theme}
              assets={assets}
              layout={layout}
              interaction={{ ...interaction, scale, onDragStart: move.onDragStart, consumeClick: move.consumeClick }}
            />
            {move.overlay}
          </div>
        </div>
      )}
      {pager && (
        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          <Button variant="ghost" size="icon" className="size-10" onClick={() => pager.goTo(pager.index - 1)} disabled={pager.index === 0} aria-label={t("pieceEditor.slides.previous")}>
            <ChevronLeft aria-hidden />
          </Button>
          <ol className="flex items-center gap-1.5" aria-label={t("pieceEditor.slides.label")}>
            {Array.from({ length: pager.total }, (_, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => pager.goTo(index)}
                  aria-label={t("pieceEditor.slides.open", { index: index + 1 })}
                  aria-current={index === pager.index ? "true" : undefined}
                  className={cn("block size-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-vk-fg/30", index === pager.index ? "bg-vk-fg" : "bg-vk-border-strong")}
                />
              </li>
            ))}
          </ol>
          <Button variant="ghost" size="icon" className="size-10" onClick={() => pager.goTo(pager.index + 1)} disabled={pager.index === pager.total - 1} aria-label={t("pieceEditor.slides.next")}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      )}
      <p className="font-mono text-[11px] text-vk-muted tabular-nums">
        {t("pieceEditor.canvasSize", { width, height })} {t("pieceEditor.free.hint")}
      </p>
    </div>
  )
}

/* ---------- salvamento ---------- */

/**
 * Grava 800 ms depois da última mudança, sempre a partir da versão que o
 * servidor confirmou por último. Falhou: tenta de novo com espera crescente
 * (2, 4, 8… até 30 s) e o que foi feito fica no estado local. 409: outra aba
 * gravou antes — para, e a tela pede para recarregar.
 */
function useAutosave(
  state: EditorState,
  dispatch: React.Dispatch<EditorAction>,
  saveDocument: ReturnType<typeof usePieceEditorSave>["saveDocument"]
) {
  const latest = useRef(state)
  latest.current = state
  const inFlight = useRef(false)

  const save = useCallback(async () => {
    if (inFlight.current) return
    const current = latest.current
    inFlight.current = true
    dispatch({ type: "saving" })
    try {
      const result = await saveDocument(current.document, current.baseVersionId)
      dispatch({ type: "saved", versionId: result.versionId, revision: current.revision, now: Date.now() })
    } catch (error) {
      if (error instanceof ApiError && error.code === "conflict") dispatch({ type: "conflict" })
      else dispatch({ type: "saveFailed" })
    } finally {
      inFlight.current = false
    }
  }, [dispatch, saveDocument])

  const { status, attempt } = state.save
  useEffect(() => {
    if (status === "pending") {
      const timer = window.setTimeout(() => void save(), AUTOSAVE_MS)
      return () => window.clearTimeout(timer)
    }
    if (status === "error") {
      const timer = window.setTimeout(() => void save(), Math.min(2 ** attempt * 1_000, 30_000))
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [status, attempt, state.revision, state.baseVersionId, save])

  // Saiu da página com alteração por gravar: o navegador pergunta.
  useEffect(() => {
    if (status === "saved") return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [status])
}

function SaveIndicator({ state, onRetry }: { state: EditorState; onRetry: () => void }) {
  const { t } = useTranslation()
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 5_000)
    return () => window.clearInterval(timer)
  }, [])

  const { status, savedAt } = state.save
  if (status === "error") {
    return (
      <button type="button" onClick={onRetry} className="h-10 rounded-md px-1 font-mono text-xs text-destructive underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-vk-fg/30">
        {t("pieceEditor.save.error")}
      </button>
    )
  }
  const text =
    status === "saving" || status === "pending"
      ? t("pieceEditor.save.saving")
      : status === "conflict"
        ? t("pieceEditor.save.conflict")
        : savedAt
          ? t("pieceEditor.save.savedAgo", { seconds: Math.max(1, Math.round((Date.now() - savedAt) / 1000)) })
          : t("pieceEditor.save.saved")
  return (
    <p className={cn("font-mono text-xs tabular-nums", status === "conflict" ? "text-destructive" : "text-vk-muted")} aria-live="polite">
      {status === "saving" && <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden />}
      {text}
    </p>
  )
}

/* ---------- atalhos ---------- */

type SlideShortcuts = { carousel: boolean; previous: () => void; next: () => void; duplicate: () => void; remove: () => void }

function useEditorShortcuts(
  state: EditorState,
  dispatch: React.Dispatch<EditorAction>,
  slides: SlideShortcuts
) {
  const latest = useRef(state)
  latest.current = state
  const actions = useRef(slides)
  actions.current = slides
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey
      const typing = (event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")
      // Lâminas: só sem elemento selecionado (com um selecionado, as setas o
      // movem) e fora de campo de texto.
      if (actions.current.carousel && !typing && latest.current.selection.slot === null && latest.current.mode === "idle") {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault()
          if (event.key === "ArrowLeft") actions.current.previous()
          else actions.current.next()
          return
        }
        if (mod && event.key.toLowerCase() === "d") {
          event.preventDefault()
          actions.current.duplicate()
          return
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault()
          actions.current.remove()
          return
        }
      }
      if (mod && event.key.toLowerCase() === "z") {
        // Um histórico só: o desfazer do editor vale também dentro dos campos.
        event.preventDefault()
        if (latest.current.mode === "inline") dispatch({ type: "mode", mode: "idle" })
        dispatch({ type: event.shiftKey ? "redo" : "undo" })
        return
      }
      if (event.key === "Escape" && latest.current.mode !== "inline") {
        if (latest.current.mode === "focal") dispatch({ type: "mode", mode: "idle" })
        else dispatch({ type: "select", slot: null })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [dispatch])
}

/* ---------- carregando ---------- */

function EditorSkeleton({ format }: { format: string }) {
  const ratio = format === "story" ? "aspect-[9/16]" : format === "feed_square" ? "aspect-square" : "aspect-[4/5]"
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy>
      <div className="flex items-center gap-4 border-b border-vk-border px-6 py-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-64" />
        <div className="flex-1" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex items-center justify-center bg-vk-faint p-6">
          <Skeleton className={cn("h-[70vh] max-h-full rounded-none", ratio)} />
        </div>
        <div className="space-y-5 border-l border-vk-border p-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    </div>
  )
}
