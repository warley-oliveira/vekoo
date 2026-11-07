import {
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
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { AttachmentDialogHandle } from "@/components/chat/composer/attachment-dialog"
import type { QuickReplyMenuHandle } from "@/components/chat/composer/quick-reply-menu"
import { useChatRecorder } from "@/hooks/chat/use-chat-recorder"
import { useSendMessage } from "@/hooks/chat/use-send-message"
import { useAttachmentLibrary } from "@/hooks/content/use-attachments"
import { useIsTouch } from "@/hooks/use-media-query"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { contactPhone } from "@/lib/chat/channel"
import {
  firstUnfilledVariable,
  referencesToVisual,
  visualToReferences,
} from "@/lib/chat/quick-reply-content"
import { readDraft, useDrafts, useReplyTo } from "@/lib/chat/stores"
import type { Chat } from "@/lib/chat/types"
import { fillQuickReply, type QuickReplyContext } from "@/lib/content/quick-reply-content"
import type { Attachment, QuickReply } from "@/lib/content/types"

const DRAFT_DEBOUNCE_MS = 300
const MAX_TEXTAREA_HEIGHT = 160

const NO_ATTACHMENTS: Attachment[] = []

export type ComposerHandle = {
  focus: () => void
  /** Arquivos arrastados para a conversa. */
  addFiles: (files: File[]) => void
  /** Escreve na posição do cursor: emoji, sugestão de resposta. */
  insertText: (text: string) => void
}

export type SlashState = { query: string; start: number }

/** `/` no começo de uma palavra, antes do cursor, abre as mensagens rápidas. */
function slashAtCaret(value: string, caret: number): SlashState | null {
  const before = value.slice(0, caret)
  const match = /(^|\s)\/([^\s/]*)$/.exec(before)
  if (!match) return null
  return { query: match[2], start: before.length - match[2].length - 1 }
}

export type UseComposerOptions = {
  chatId: string
  chat: Chat
  onSent: () => void
  ref?: Ref<ComposerHandle>
}

/**
 * O que a caixa de escrever sabe fazer, sem dizer como ela parece: é o mesmo em tela larga e no
 * celular. A caixa de texto não é controlada: a letra mora no DOM, e o React só fica sabendo do que
 * muda o desenho (se há texto, se abriu `/`). É o que garante que digitar não desenha nada, nem aqui,
 * nem na lista, nem no histórico. O rascunho vai para o store com atraso.
 */
export function useComposer({ chatId, chat, onSent, ref }: UseComposerOptions) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()

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

  /** Vinda do `/` troca o que foi digitado depois da barra; sem ele, entra onde estiver o cursor. */
  const pickQuickReply = useCallback(
    (reply: QuickReply) => {
      const element = textarea.current
      if (!element) return

      // O servidor não conhece variável de mensagem rápida: é aqui que `{{nome}}` vira o nome.
      const { text, references: found } = referencesToVisual(
        fillQuickReply(reply.content, fillContext),
        attachmentLibrary,
        fallbackAttachment
      )
      for (const [label, id] of found) references.current.set(label, id)

      element.setRangeText(
        text,
        slash ? slash.start : element.selectionStart,
        slash ? element.selectionStart : element.selectionEnd,
        "end"
      )
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

  const notice =
    recorder.status === "denied"
      ? t("chat.recorder.denied")
      : recorder.status === "error"
        ? t("chat.recorder.failed")
        : null

  return {
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
    sending: recorder.status === "sending",
    refreshFromInput,
    insertText,
    pickQuickReply,
    submit,
    onKeyDown,
    onPaste,
    onAttachmentsSent,
  }
}
