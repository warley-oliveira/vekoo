import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import {
  ChevronLeft,
  Delete,
  Keyboard,
  Loader2,
  Lock,
  Mic,
  Plus,
  SendHorizontal,
  Smile,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react"

import { useConfirm } from "@/components/shared"
import { SHEET_EXIT_MS } from "@/components/shell/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { useComposer } from "@/hooks/chat/use-composer"
import { useSuggestReply } from "@/hooks/chat-details/use-suggest-reply"
import { useBackLayer } from "@/hooks/use-back-layer"
import { useHoldToRecord } from "@/hooks/chat-mobile/use-hold-to-record"
import { openTemplateSender } from "@/lib/chat-details/template-sender-store"
import { rememberedKeyboardHeight, useKeyboardOpen } from "@/lib/chat-mobile/keyboard"
import { isConnectorDown } from "@/lib/chat/channel"
import { formatDuration } from "@/lib/file-utils"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { AttachmentDialog } from "../composer/attachment-dialog"
import {
  AutomationHint,
  QuickRepliesPrefetch,
  ReplyBar,
  type ComposerBoxProps,
} from "../composer/composer"
import { QuickReplyMenu } from "../composer/quick-reply-menu"
import { RecorderWaveform } from "../composer/waveform"
import { ComposerActionsSheet, QuickRepliesSheet, type FileSource } from "./composer-sheets"

const EmojiPicker = lazy(() => import("../composer/emoji-picker"))

/** O que falta para o teclado responder, antes de desistir de esperar e fechar o painel de emoji. */
const KEYBOARD_SWAP_TIMEOUT_MS = 450

const MIN_EMOJI_HEIGHT = 240
const DISCARD_WITHOUT_ASKING_SECONDS = 5
/** A faixa de cima do painel, com apagar. O painel inteiro é que fica do tamanho do teclado. */
const EMOJI_BAR_HEIGHT = 45

/** Por origem, e não um seletor só: com um `accept` genérico, cada aparelho abre um menu diferente. */
const FILE_SOURCES: Record<FileSource, { accept: string; capture?: "environment"; multiple: boolean }> = {
  camera: { accept: "image/*", capture: "environment", multiple: false },
  gallery: { accept: "image/*,video/*", multiple: true },
  document: { accept: "audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip", multiple: true },
}

/** O envio não tira o foco da caixa: o teclado continua aberto para a próxima mensagem. */
const keepFocus = (event: React.MouseEvent) => event.preventDefault()

/**
 * Onde se escreve, no celular. A lógica é a mesma da tela larga (`useComposer`); muda a forma, pensada
 * para o polegar. Na linha, só o que se usa toda hora: mais opções, a caixa com o emoji e enviar ou
 * gravar. O resto mora na folha do "+". A caixa cresce com o texto até um teto, e quem cede espaço é o
 * histórico, que continua colado nela (`useBottomAnchor`).
 */
export default function MobileComposerBox({
  chatId,
  chat,
  contactName,
  onSent,
  ref,
}: ComposerBoxProps) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const confirm = useConfirm()
  const {
    textarea,
    attachments,
    quickReplyMenu,
    hasText,
    slash,
    setSlash,
    unfilled,
    fillContext,
    isTouch,
    recorder,
    notice,
    sending,
    refreshFromInput,
    insertText,
    pickQuickReply,
    submit,
    onKeyDown,
    onPaste,
    onAttachmentsSent,
  } = useComposer({ chatId, chat, onSent, ref })

  const root = useRef<HTMLDivElement>(null)
  const cancelHint = useRef<HTMLSpanElement>(null)
  const inputs = useRef<Partial<Record<FileSource, HTMLInputElement | null>>>({})

  const [emojiHeight, setEmojiHeight] = useState<number | null>(null)
  const [swappingToKeyboard, setSwappingToKeyboard] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [repliesOpen, setRepliesOpen] = useState(false)
  const emojiOpen = emojiHeight !== null
  const keyboardOpen = useKeyboardOpen()

  const blurInput = useCallback(() => textarea.current?.blur(), [textarea])
  const {
    mode: recordMode,
    send: sendRecording,
    handlers: recordHandlers,
  } = useHoldToRecord(recorder, {
    hint: cancelHint,
    onLock: blurInput,
  })

  const { byId: connectors } = useChatConnectors()
  const connector = chat.connectorId ? connectors.get(chat.connectorId) : undefined
  const canSendTemplate = connector?.type === "whatsapp_cloud" && !isConnectorDown(connector)
  const { suggest, loading: suggesting } = useSuggestReply(chatId, insertText)

  const closeEmoji = useCallback(() => {
    setEmojiHeight(null)
    setSwappingToKeyboard(false)
  }, [])

  // O voltar desfaz o que está aberto aqui antes de sair da conversa. Um áudio de poucos segundos sai
  // na hora; um mais longo não se perde por um toque sem querer no voltar.
  useBackLayer(emojiOpen, closeEmoji)
  useBackLayer(Boolean(slash), () => setSlash(null))
  useBackLayer(recorder.isRecording, () => {
    if (recorder.elapsed < DISCARD_WITHOUT_ASKING_SECONDS) {
      recorder.cancel()
      return
    }
    void confirm({
      title: t("chatMobile.composer.discardTitle"),
      description: t("chatMobile.composer.discardHint", { duration: formatDuration(recorder.elapsed) }),
      confirmLabel: t("chat.recorder.discard"),
      cancelLabel: t("chatMobile.composer.discardKeep"),
      destructive: true,
    }).then((discard) => {
      if (discard) recorder.cancel()
    })
    return false
  })

  /** O painel de emoji fica onde o teclado fica, do tamanho dele: a troca não mexe na conversa. */
  const openEmoji = () => {
    const available = window.visualViewport?.height ?? window.innerHeight
    textarea.current?.blur()
    setSlash(null)
    setEmojiHeight(Math.max(MIN_EMOJI_HEIGHT, Math.min(rememberedKeyboardHeight(), available * 0.5)))
  }

  // Do emoji para o teclado: o painel só sai quando o teclado chega, para o composer não descer e
  // subir de novo. Teclado físico não chega nunca, daí o prazo.
  useEffect(() => {
    if (!swappingToKeyboard) return
    if (keyboardOpen) {
      closeEmoji()
      return
    }
    const timer = window.setTimeout(closeEmoji, KEYBOARD_SWAP_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [closeEmoji, keyboardOpen, swappingToKeyboard])

  // Gravar toma a linha inteira: o painel de emoji não fica aberto embaixo dela.
  useEffect(() => {
    if (recorder.isBusy) closeEmoji()
  }, [closeEmoji, recorder.isBusy])

  // Tocar no histórico: fecha o painel, e desce o teclado para ler melhor. Rolar não conta.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element
      if (root.current?.contains(target)) return
      if (!target.closest("[data-virtuoso-scroller]")) return
      if (target.closest('a, button, video, audio, input, [role="slider"]')) return
      closeEmoji()
      setSlash(null)
      textarea.current?.blur()
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [closeEmoji, setSlash, textarea])

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    attachments.current?.add(Array.from(event.target.files ?? []))
    // Limpa para o mesmo arquivo poder ser escolhido de novo.
    event.target.value = ""
  }

  const pickFiles = (source: FileSource) => {
    setActionsOpen(false)
    inputs.current[source]?.click()
  }

  const onSuggest = () => {
    void suggest().finally(() => setActionsOpen(false))
  }

  // Uma folha só por vez: esta espera a outra sair. Abrindo junto, o `history.back()` de quem fecha
  // cairia em cima da entrada de quem abre, e a folha nova fecharia sozinha.
  const chainTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(chainTimer.current), [])
  const openRepliesFromActions = () => {
    setActionsOpen(false)
    window.clearTimeout(chainTimer.current)
    chainTimer.current = window.setTimeout(() => setRepliesOpen(true), SHEET_EXIT_MS)
  }

  /** O emoji não tem tecla de apagar por perto: esta tira o último caractere, inteiro. */
  const deleteBackward = () => {
    const element = textarea.current
    if (!element) return

    const start = element.selectionStart
    const end = element.selectionEnd
    if (start !== end) {
      element.setRangeText("", start, end, "end")
    } else if (start > 0) {
      const before = element.value.slice(0, start)
      // Por grafema: um emoji com tom de pele são vários caracteres, e sai inteiro.
      const graphemes = Array.from(
        new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(before)
      )
      const last = graphemes.at(-1)
      if (last) element.setRangeText("", last.index, start, "end")
    }
    refreshFromInput()
  }

  const recording = recorder.isBusy
  const locked = recordMode === "locked" || sending

  return (
    <div
      ref={root}
      // Sem faixa própria: o composer flutua no fundo da conversa, como na tela larga. Só o painel de
      // emoji, que toma o lugar do teclado, tem fundo sólido.
      className="relative shrink-0 [contain:layout_style]"
    >
      <div
        className={cn(
          "px-2 pt-1.5",
          emojiOpen
            ? "pb-1.5"
            : "pb-[calc(0.375rem_+_max(0px,_var(--app-safe-bottom)_-_var(--kb-inset,_0px)))]"
        )}
      >
        <QuickRepliesPrefetch />
        {/* Deitado, cada linha conta: o aviso continua na conversa e no painel, mas sai daqui. */}
        <div className="px-1 empty:hidden landscape:hidden">
          <AutomationHint chat={chat} short />
        </div>
        <div className="px-1">
          <ReplyBar chatId={chatId} contactName={contactName} />
        </div>

        {unfilled ? (
          <p role="status" className="flex items-start gap-1.5 px-1 pb-1.5 text-xs text-status-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">{t("chat.composer.unfilledVariable", { marker: unfilled })}</span>
          </p>
        ) : null}

        {notice ? (
          <p role="alert" className="flex items-center justify-between gap-2 px-1 pb-1.5 text-xs text-status-warning">
            {notice}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("chat.recorder.dismiss")}
              onClick={recorder.dismissNotice}
            >
              <X />
            </Button>
          </p>
        ) : null}

        <div className="relative">
          {slash ? (
            <QuickReplyMenu
              ref={quickReplyMenu}
              query={slash.query}
              context={fillContext}
              onPick={pickQuickReply}
              inlinePreview
              className="max-h-[min(20rem,calc(var(--app-vh,100dvh)*0.45))]"
            />
          ) : null}

          <div className="flex items-end gap-1">
            {locked && recording ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={sending}
                className="size-11 shrink-0 rounded-full text-muted-foreground [&_svg]:size-5"
                aria-label={t("chat.recorder.discard")}
                onClick={recorder.cancel}
              >
                <Trash2 />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={recording}
                aria-haspopup="dialog"
                className="size-11 shrink-0 rounded-full text-muted-foreground [&_svg]:size-6"
                aria-label={t("chatMobile.composer.actions")}
                onClick={() => {
                  // A folha não abre por cima do teclado: ele desce antes.
                  textarea.current?.blur()
                  closeEmoji()
                  setActionsOpen(true)
                }}
              >
                <Plus />
              </Button>
            )}

            <div
              className={cn(
                "relative flex min-h-11 min-w-0 flex-1 items-end rounded-[1.375rem] bg-card shadow-sm ring-1 ring-border/70 transition-shadow",
                !recording && "focus-within:ring-ring/60"
              )}
            >
              {/* Gravando, a caixa continua aí, escondida: segurar o botão não pode derrubar o teclado
                  e mexer na tela debaixo do dedo. */}
              <textarea
                ref={textarea}
                rows={1}
                aria-label={t("chat.composer.label")}
                placeholder={t(isTouch ? "chat.composer.placeholderTouch" : "chat.composer.placeholder")}
                enterKeyHint={isTouch ? "enter" : "send"}
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck
                inputMode="text"
                tabIndex={recording ? -1 : undefined}
                onInput={refreshFromInput}
                onClick={refreshFromInput}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onFocus={() => {
                  if (emojiOpen) setSwappingToKeyboard(true)
                }}
                className={cn(
                  "max-h-[min(10rem,calc(var(--app-vh,100dvh)*0.3))] min-h-11 min-w-0 flex-1 resize-none bg-transparent py-[0.6875rem] pl-4 text-base leading-[1.375rem] outline-none placeholder:text-muted-foreground",
                  recording && "pointer-events-none opacity-0"
                )}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-11 shrink-0 rounded-full text-muted-foreground [&_svg]:size-5",
                  recording && "invisible"
                )}
                aria-label={emojiOpen ? t("chatMobile.composer.keyboard") : t("chat.composer.emoji")}
                aria-pressed={emojiOpen}
                onClick={() => {
                  if (emojiOpen) textarea.current?.focus()
                  else openEmoji()
                }}
              >
                {emojiOpen ? <Keyboard /> : <Smile />}
              </Button>

              <AnimatePresence initial={false}>
                {recording ? (
                  <motion.div
                    key="recorder"
                    {...preset.fade}
                    className="absolute inset-0 flex items-center gap-2 overflow-hidden rounded-[1.375rem] pr-3 pl-4"
                  >
                    <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-status-danger" />
                    <span
                      role="timer"
                      aria-label={t("chat.recorder.elapsed")}
                      className="shrink-0 text-sm tabular-nums"
                    >
                      {formatDuration(recorder.elapsed)}
                    </span>
                    {recordMode === "hold" ? (
                      <span
                        ref={cancelHint}
                        className="flex min-w-0 flex-1 items-center justify-center gap-0.5 text-xs text-muted-foreground"
                      >
                        <ChevronLeft aria-hidden className="size-3.5 shrink-0" />
                        <span className="truncate">{t("chatMobile.composer.slideToCancel")}</span>
                      </span>
                    ) : (
                      <RecorderWaveform analyser={recorder.analyser} active={recorder.isRecording} />
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="relative size-11 shrink-0">
              <AnimatePresence initial={false}>
                {recordMode === "hold" ? (
                  <motion.span
                    key="lock"
                    {...preset.slideUp}
                    aria-hidden
                    className="absolute -top-16 left-0 flex h-14 w-11 flex-col items-center justify-center gap-0.5 rounded-full border bg-background text-muted-foreground shadow-sm"
                  >
                    <Lock className="size-4" />
                    <span className="text-[0.625rem] leading-none">{t("chatMobile.composer.slideToLock")}</span>
                  </motion.span>
                ) : null}
              </AnimatePresence>

              {hasText && !recording ? (
                <Button
                  type="button"
                  size="icon"
                  className="size-11 rounded-full [&_svg]:size-5"
                  aria-label={t("chat.composer.send")}
                  onMouseDown={keepFocus}
                  onClick={submit}
                >
                  <SendHorizontal />
                </Button>
              ) : locked && recording ? (
                <Button
                  type="button"
                  size="icon"
                  disabled={sending}
                  className="size-11 rounded-full [&_svg]:size-5"
                  aria-label={t("chat.recorder.send")}
                  onClick={sendRecording}
                >
                  {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
                </Button>
              ) : (
                <Button
                  type="button"
                  data-record-button
                  variant={recordMode === "hold" ? "default" : "ghost"}
                  size="icon"
                  className={cn(
                    "size-11 rounded-full [&_svg]:size-5",
                    recordMode === "hold" ? "scale-125" : "text-muted-foreground"
                  )}
                  aria-label={t("chat.recorder.start")}
                  onMouseDown={keepFocus}
                  onContextMenu={keepFocus}
                  {...recordHandlers}
                >
                  <Mic />
                </Button>
              )}
            </div>
          </div>
        </div>

        {(Object.keys(FILE_SOURCES) as FileSource[]).map((source) => {
          const { accept, capture, multiple } = FILE_SOURCES[source]
          return (
            <input
              key={source}
              ref={(node) => {
                inputs.current[source] = node
              }}
              hidden
              type="file"
              accept={accept}
              capture={capture}
              multiple={multiple}
              onChange={onFileInput}
              aria-label={t(`chatMobile.composer.${source}`)}
            />
          )
        })}

        <AttachmentDialog ref={attachments} chatId={chatId} onSent={onAttachmentsSent} />
      </div>

      {emojiOpen ? (
        <div className="bg-background pb-safe" data-emoji-panel>
          <div className="flex h-11 items-center justify-between border-t pr-1 pl-3">
            <span className="text-xs font-medium text-muted-foreground">{t("chat.composer.emoji")}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 rounded-full text-muted-foreground [&_svg]:size-5"
              aria-label={t("chatMobile.composer.deleteBackward")}
              onClick={deleteBackward}
            >
              <Delete />
            </Button>
          </div>
          <Suspense
            fallback={
              <Skeleton className="w-full" style={{ height: emojiHeight - EMOJI_BAR_HEIGHT }} />
            }
          >
            <EmojiPicker onPick={insertText} height={emojiHeight - EMOJI_BAR_HEIGHT} />
          </Suspense>
        </div>
      ) : null}

      <ComposerActionsSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        suggesting={suggesting}
        canSendTemplate={canSendTemplate}
        onPickFiles={pickFiles}
        onOpenQuickReplies={openRepliesFromActions}
        onSuggest={onSuggest}
        onSendTemplate={() => {
          setActionsOpen(false)
          openTemplateSender(chatId)
        }}
      />

      <QuickRepliesSheet
        open={repliesOpen}
        onClose={() => setRepliesOpen(false)}
        context={fillContext}
        onPick={(reply) => {
          setRepliesOpen(false)
          pickQuickReply(reply)
        }}
      />
    </div>
  )
}
