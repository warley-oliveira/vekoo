import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type Ref,
} from "react"
import { Link } from "react-router"
import { SWRConfig } from "swr"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import {
  Bot,
  Loader2,
  Mic,
  Paperclip,
  SendHorizontal,
  Smile,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Callout, ResponsivePopover } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { REFERENCE_DATA } from "@/hooks/chat/use-chat-refs"
import { useChatRecorder } from "@/hooks/chat/use-chat-recorder"
import { useSendMessage } from "@/hooks/chat/use-send-message"
import { useAttachmentLibrary } from "@/hooks/content/use-attachments"
import { useQuickReplies } from "@/hooks/content/use-quick-replies"
import { useCan } from "@/hooks/use-can"
import { useIsTouch } from "@/hooks/use-media-query"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { contactPhone } from "@/lib/chat/channel"
import { useChat } from "@/lib/chat/chat-store"
import type { ComposerMode } from "@/lib/chat/composer-mode"
import {
  firstUnfilledVariable,
  referencesToVisual,
  visualToReferences,
} from "@/lib/chat/quick-reply-content"
import { readDraft, useDrafts, useReplyTo } from "@/lib/chat/stores"
import type { Chat } from "@/lib/chat/types"
import { fillQuickReply, type QuickReplyContext } from "@/lib/content/quick-reply-content"
import type { Attachment, QuickReply } from "@/lib/content/types"
import { formatDuration } from "@/lib/file-utils"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { ComposerExtras, TemplateSender } from "../extension-points"
import { QuotedMessage } from "../thread/message-parts"
import { AttachmentDialog, type AttachmentDialogHandle } from "./attachment-dialog"
import { QuickReplyMenu, type QuickReplyMenuHandle } from "./quick-reply-menu"
import { RecorderWaveform } from "./waveform"

const EmojiPicker = lazy(() => import("./emoji-picker"))

const DRAFT_DEBOUNCE_MS = 300
const MAX_TEXTAREA_HEIGHT = 160

const NO_ATTACHMENTS: Attachment[] = []

/** Só busca, para `/` abrir sem espera. À parte, para a revalidação não desenhar o composer. */
function QuickRepliesPrefetch() {
  useQuickReplies()
  return null
}

export type ComposerHandle = {
  focus: () => void
  /** Arquivos arrastados para a conversa. */
  addFiles: (files: File[]) => void
  /** Escreve na posição do cursor: emoji, sugestão de resposta. */
  insertText: (text: string) => void
}

type SlashState = { query: string; start: number }

/** `/` no começo de uma palavra, antes do cursor, abre as mensagens rápidas. */
function slashAtCaret(value: string, caret: number): SlashState | null {
  const before = value.slice(0, caret)
  const match = /(^|\s)\/([^\s/]*)$/.exec(before)
  if (!match) return null
  return { query: match[2], start: before.length - match[2].length - 1 }
}

function EmojiButton({ onPick }: { onPick: (emoji: string) => void }) {
  const { t } = useTranslation()

  return (
    <ResponsivePopover
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full text-muted-foreground pointer-coarse:size-10"
          aria-label={t("chat.composer.emoji")}
          title={t("chat.composer.emoji")}
        >
          <Smile />
        </Button>
      }
      title={t("chat.composer.emoji")}
      className="w-80 p-0"
      sheetClassName="px-0"
    >
      <Suspense fallback={<Skeleton className="h-85 w-full" />}>
        <EmojiPicker onPick={onPick} />
      </Suspense>
    </ResponsivePopover>
  )
}

/** A resposta citada, acima da caixa de texto. Esc ou o X desistem. */
const ReplyBar = memo(function ReplyBar({
  chatId,
  contactName,
}: {
  chatId: string
  contactName: string
}) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const message = useReplyTo((state) => state.byChat[chatId])
  const clear = useReplyTo((state) => state.clearReplyTo)

  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.div key="reply" {...preset.slideUp} className="flex items-center gap-1 pb-2">
          <QuotedMessage message={message} contactName={contactName} className="min-w-0 flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground pointer-coarse:size-10"
            aria-label={t("chat.reply.cancel")}
            onClick={() => clear(chatId)}
          >
            <X />
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
})

/**
 * Quem está cuidando da conversa. Com a automação ligada, avisa antes: responder pausa. É o aviso
 * certo para a intervenção humana, porque quem responde é quem precisa saber o que vai acontecer.
 */
const AutomationHint = memo(function AutomationHint({ chat }: { chat: Chat }) {
  const { t } = useTranslation()
  const language = useLanguage()

  if (chat.partial) return null

  if (chat.automationEnabled) {
    return (
      <p className="flex items-center gap-1.5 pb-1.5 text-xs text-muted-foreground">
        <Bot aria-hidden className="size-3.5 shrink-0" />
        {t("chat.composer.automationOn")}
      </p>
    )
  }

  if (chat.automationResumeAt) {
    return (
      <p className="flex items-center gap-1.5 pb-1.5 text-xs text-muted-foreground">
        <Bot aria-hidden className="size-3.5 shrink-0" />
        {t("chat.composer.automationResumes", {
          when: formatRelative(chat.automationResumeAt, language),
        })}
      </p>
    )
  }

  return null
})

/**
 * A folga sob o composer soma a área segura do aparelho, mas não com o teclado aberto: aí quem fica
 * embaixo é o teclado, e a folga viraria um buraco entre os dois.
 */
const BOTTOM_PADDING = "pb-[calc(0.75rem_+_max(0px,_var(--app-safe-bottom)_-_var(--kb-inset,_0px)))]"

/** No lugar do composer, onde só dá para ler: a aba "Todos" de um contato. */
export function ReadOnlyNotice() {
  const { t } = useTranslation()

  return (
    <div className={cn("shrink-0 border-t px-4 pt-3 text-center text-sm text-muted-foreground", BOTTOM_PADDING)}>
      {t("chat.composer.readOnly")}
    </div>
  )
}

/** Quando não dá para escrever: por quê, e o que resolve. */
function ComposerNotice({ chat, mode }: { chat: Chat; mode: ComposerMode }) {
  const { t } = useTranslation()
  const canManage = useCan("core_settings")

  if (mode === "read-only") return <ReadOnlyNotice />

  const platform = chat.audienceType === "instagram" ? "instagram" : "messenger"
  const title =
    mode === "waba-expired"
      ? t("chat.composer.wabaExpiredTitle")
      : mode === "meta-expired"
        ? t("chat.composer.metaExpiredTitle")
        : t("chat.composer.disconnectedTitle")
  const description =
    mode === "waba-expired"
      ? t("chat.composer.wabaExpired")
      : mode === "meta-expired"
        ? t(`chat.composer.metaExpired.${platform}`)
        : t("chat.composer.disconnected")

  return (
    <div className={cn("shrink-0 border-t px-3 pt-3 md:px-5", BOTTOM_PADDING)}>
      <Callout
        tone={mode === "disconnected" ? "warning" : "neutral"}
        icon={<TriangleAlert className="size-4" />}
        title={title}
        action={
          mode === "disconnected" && canManage && chat.connectorId ? (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link to={`/settings/integrations/${chat.connectorId}`} />}
            >
              {t("chat.composer.openChannel")}
            </Button>
          ) : undefined
        }
      >
        {description}
      </Callout>
      <TemplateSender chat={chat} mode={mode} />
    </div>
  )
}

/**
 * Onde se escreve. A caixa de texto não é controlada: a letra mora no DOM, e o React só fica sabendo
 * do que muda o desenho (se há texto, se abriu `/`). É o que garante que digitar não desenha nada,
 * nem aqui, nem na lista, nem no histórico. O rascunho vai para o store com atraso.
 */
export const Composer = memo(function Composer({
  chatId,
  mode,
  contactName,
  onSent,
  ref,
}: {
  chatId: string
  mode: ComposerMode
  contactName: string
  onSent: () => void
  ref?: Ref<ComposerHandle>
}) {
  const chat = useChat(chatId)

  if (!chat) return null
  if (mode !== "compose") return <ComposerNotice chat={chat} mode={mode} />

  // A caixa nasce de novo a cada conversa aberta: sem isto, cada troca de conversa buscaria outra vez
  // mensagens rápidas e anexos. Quem as atualiza é o menu, quando abre.
  return (
    <SWRConfig value={REFERENCE_DATA}>
      <ComposerBox
        chatId={chatId}
        chat={chat}
        contactName={contactName}
        onSent={onSent}
        ref={ref}
      />
    </SWRConfig>
  )
})

function ComposerBox({
  chatId,
  chat,
  contactName,
  onSent,
  ref,
}: {
  chatId: string
  chat: Chat
  contactName: string
  onSent: () => void
  ref?: Ref<ComposerHandle>
}) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const preset = useMotionPreset()

  const textarea = useRef<HTMLTextAreaElement>(null)
  const attachments = useRef<AttachmentDialogHandle>(null)
  const quickReplyMenu = useRef<QuickReplyMenuHandle>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Da linha "📎 Nome" para o id do anexo: é como a citação volta ao enviar.
  const references = useRef(new Map<string, string>())

  const [hasText, setHasText] = useState(false)
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [unfilled, setUnfilled] = useState<string | null>(null)

  const { send, removeWaitingTag } = useSendMessage(chatId)
  const { attachments: library = NO_ATTACHMENTS } = useAttachmentLibrary()
  const attachmentLibrary = useMemo(
    () => new Map(library.map((attachment) => [attachment.id, attachment])),
    [library]
  )
  const agentName = useAuth().session?.account.name

  // Vale o nome de verdade: sem ele, `{{nome}}` fica à vista, em vez de virar "Contato".
  const fillContext = useMemo<QuickReplyContext>(
    () => ({
      contactName: chat.displayName || chat.userName,
      phone: contactPhone(chat),
      agentName,
      customAttributes: chat.customAttributes,
    }),
    [agentName, chat]
  )

  const fallbackAttachment = t("chat.attachments.fallbackName")

  const resize = useCallback(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [])

  const saveDraft = useCallback(() => {
    const element = textarea.current
    if (!element) return
    useDrafts
      .getState()
      .setDraft(chatId, visualToReferences(element.value, references.current))
  }, [chatId])

  const scheduleDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(saveDraft, DRAFT_DEBOUNCE_MS)
  }, [saveDraft])

  // Abrir a conversa: o rascunho volta como estava. Sair: nada se perde no atraso.
  useEffect(() => {
    const element = textarea.current
    if (!element) return

    const { text, references: found } = referencesToVisual(
      readDraft(chatId),
      attachmentLibrary,
      fallbackAttachment
    )
    references.current = found
    element.value = text
    setHasText(text.trim().length > 0)
    setSlash(null)
    setUnfilled(firstUnfilledVariable(text)?.marker ?? null)
    resize()
    if (!isTouch) element.focus({ preventScroll: true })

    return () => {
      if (draftTimer.current) {
        clearTimeout(draftTimer.current)
        draftTimer.current = null
        useDrafts
          .getState()
          .setDraft(chatId, visualToReferences(element.value, references.current))
      }
    }
    // A biblioteca de anexos só dá nome às citações do rascunho: não reabre a conversa ao chegar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])

  const refreshFromInput = useCallback(() => {
    const element = textarea.current
    if (!element) return

    const filled = element.value.trim().length > 0
    setHasText((current) => (current === filled ? current : filled))
    setUnfilled(firstUnfilledVariable(element.value)?.marker ?? null)

    const next = slashAtCaret(element.value, element.selectionStart)
    setSlash((current) =>
      current?.query === next?.query && current?.start === next?.start ? current : next
    )

    resize()
    scheduleDraft()
  }, [resize, scheduleDraft])

  const insertText = useCallback(
    (text: string) => {
      const element = textarea.current
      if (!element) return

      const start = element.selectionStart ?? element.value.length
      const end = element.selectionEnd ?? start
      element.setRangeText(text, start, end, "end")
      refreshFromInput()
      if (!isTouch) element.focus()
    },
    [isTouch, refreshFromInput]
  )

  const pickQuickReply = useCallback(
    (reply: QuickReply) => {
      const element = textarea.current
      if (!element || !slash) return

      // O servidor não conhece variável de mensagem rápida: é aqui que `{{nome}}` vira o nome.
      const { text, references: found } = referencesToVisual(
        fillQuickReply(reply.content, fillContext),
        attachmentLibrary,
        fallbackAttachment
      )
      for (const [label, id] of found) references.current.set(label, id)

      element.setRangeText(text, slash.start, element.selectionStart, "end")
      setSlash(null)
      refreshFromInput()
      setSlash(null)
      element.focus()
    },
    [attachmentLibrary, fallbackAttachment, fillContext, refreshFromInput, slash]
  )

  const submit = useCallback(() => {
    const element = textarea.current
    if (!element) return

    const text = element.value.trim()
    if (!text) return

    // `{{assim}}` chegaria igual ao contato. A primeira tentativa leva até a variável, para trocar;
    // a segunda, com ela ainda selecionada, é quem quer mesmo enviar assim.
    const variable = firstUnfilledVariable(element.value)
    if (
      variable &&
      (element.selectionStart !== variable.start || element.selectionEnd !== variable.end)
    ) {
      element.focus()
      element.setSelectionRange(variable.start, variable.end)
      return
    }

    const replyTo = useReplyTo.getState().byChat[chatId]
    send({
      payload: visualToReferences(text, references.current),
      text,
      replyToMessageId: replyTo?.id ?? null,
    })

    element.value = ""
    references.current = new Map()
    if (draftTimer.current) clearTimeout(draftTimer.current)
    draftTimer.current = null
    useDrafts.getState().clearDraft(chatId)
    useReplyTo.getState().clearReplyTo(chatId)
    setHasText(false)
    setSlash(null)
    setUnfilled(null)
    resize()
    onSent()
  }, [chatId, onSent, resize, send])

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return

    if (slash) {
      if (event.key === "Escape") {
        event.preventDefault()
        setSlash(null)
        return
      }
      if (quickReplyMenu.current?.handleKey(event)) return
    }

    if (event.key === "Escape" && useReplyTo.getState().byChat[chatId]) {
      useReplyTo.getState().clearReplyTo(chatId)
      return
    }

    // Com dedo, Enter quebra linha: quem envia é o botão. Com teclado, Enter envia.
    if (event.key === "Enter" && !event.shiftKey && !isTouch) {
      event.preventDefault()
      submit()
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length > 0) {
      event.preventDefault()
      attachments.current?.add(files)
    }
  }

  const onAttachmentsSent = useCallback(() => {
    removeWaitingTag(chatId)
    onSent()
  }, [chatId, onSent, removeWaitingTag])

  const onAudioSent = useCallback(() => {
    removeWaitingTag(chatId)
    onSent()
  }, [chatId, onSent, removeWaitingTag])

  const onAudioFailed = useCallback(
    (error: unknown) => {
      toast.error(
        error instanceof ApiError && error.serverMessage
          ? error.serverMessage
          : t("chat.recorder.sendFailed")
      )
    },
    [t]
  )

  const recorder = useChatRecorder({
    chatId,
    onSent: onAudioSent,
    onSendFailed: onAudioFailed,
  })

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textarea.current?.focus(),
      addFiles: (files) => attachments.current?.add(files),
      insertText,
    }),
    [insertText]
  )

  const sending = recorder.status === "sending"
  const notice =
    recorder.status === "denied"
      ? t("chat.recorder.denied")
      : recorder.status === "error"
        ? t("chat.recorder.failed")
        : null

  const composerActions = useMemo(
    () => (
      <ComposerExtras chat={chat} insertText={insertText} disabled={recorder.isBusy} />
    ),
    [chat, insertText, recorder.isBusy]
  )

  return (
    <div className={cn("relative shrink-0 border-t px-3 pt-2 md:px-5", BOTTOM_PADDING)}>
      <QuickRepliesPrefetch />
      <AutomationHint chat={chat} />
      <ReplyBar chatId={chatId} contactName={contactName} />

      {unfilled ? (
        <p role="status" className="flex items-start gap-1.5 pb-1.5 text-xs text-status-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">{t("chat.composer.unfilledVariable", { marker: unfilled })}</span>
        </p>
      ) : null}

      {notice ? (
        <p role="alert" className="flex items-center justify-between gap-2 pb-2 text-xs text-status-warning">
          {notice}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
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
          />
        ) : null}

        <AnimatePresence initial={false} mode="popLayout">
          {recorder.isBusy ? (
            <motion.div
              key="recorder"
              {...preset.fade}
              className="flex min-h-11 items-center gap-1 rounded-2xl border bg-background px-1.5 py-1"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={sending}
                      className="shrink-0 rounded-full text-muted-foreground pointer-coarse:size-10"
                      aria-label={t("chat.recorder.discard")}
                      onClick={recorder.cancel}
                    />
                  }
                >
                  <Trash2 />
                </TooltipTrigger>
                <TooltipContent>{t("chat.recorder.discard")}</TooltipContent>
              </Tooltip>

              <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-status-danger" />
              <span
                role="timer"
                aria-label={t("chat.recorder.elapsed")}
                className="w-10 shrink-0 text-center text-sm text-muted-foreground tabular-nums"
              >
                {formatDuration(recorder.elapsed)}
              </span>
              <RecorderWaveform analyser={recorder.analyser} active={recorder.isRecording} />

              <Button
                type="button"
                size="icon"
                disabled={sending}
                className="shrink-0 rounded-full pointer-coarse:size-10"
                aria-label={t("chat.recorder.send")}
                onClick={recorder.stopAndSend}
              >
                {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="text"
              {...preset.fade}
              className="flex items-end gap-0.5 rounded-2xl border bg-background px-1.5 py-1 transition-colors focus-within:border-ring/70"
            >
              <EmojiButton onPick={insertText} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full text-muted-foreground pointer-coarse:size-10"
                aria-label={t("chat.composer.attach")}
                title={t("chat.composer.attach")}
                onClick={() => attachments.current?.pick()}
              >
                <Paperclip />
              </Button>
              {composerActions}

              <textarea
                ref={textarea}
                rows={1}
                aria-label={t("chat.composer.label")}
                placeholder={t(isTouch ? "chat.composer.placeholderTouch" : "chat.composer.placeholder")}
                enterKeyHint={isTouch ? "enter" : "send"}
                onInput={refreshFromInput}
                onClick={refreshFromInput}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                className="max-h-40 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-base leading-5 outline-none placeholder:text-muted-foreground md:text-sm pointer-coarse:min-h-10 pointer-coarse:py-2.5"
              />

              {hasText ? (
                <Button
                  type="button"
                  size="icon"
                  className="shrink-0 rounded-full pointer-coarse:size-10"
                  aria-label={t("chat.composer.send")}
                  title={t("chat.composer.send")}
                  onClick={submit}
                >
                  <SendHorizontal />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-full text-muted-foreground pointer-coarse:size-10"
                  aria-label={t("chat.recorder.start")}
                  title={t("chat.recorder.start")}
                  onClick={() => void recorder.start()}
                >
                  <Mic />
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AttachmentDialog ref={attachments} chatId={chatId} onSent={onAttachmentsSent} />
    </div>
  )
}
