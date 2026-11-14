import { lazy, memo, Suspense, useMemo, type ComponentType, type Ref } from "react"
import { Link } from "@/lib/router"
import { SWRConfig } from "swr"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import {
  Loader2,
  Mic,
  Paperclip,
  SendHorizontal,
  Smile,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react"

import { Callout, ResponsivePopover } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { REFERENCE_DATA } from "@/hooks/chat/use-chat-refs"
import { useComposer, type ComposerHandle } from "@/hooks/chat/use-composer"
import { useQuickReplies } from "@/hooks/content/use-quick-replies"
import { useCan } from "@/hooks/use-can"
import { useChat } from "@/lib/chat/chat-store"
import type { ComposerMode } from "@/lib/chat/composer-mode"
import { useReplyTo } from "@/lib/chat/stores"
import type { Chat } from "@/lib/chat/types"
import { formatDuration } from "@/lib/file-utils"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { ComposerExtras, TemplateSender } from "../extension-points"
import { QuotedMessage } from "../thread/message-parts"
import { AttachmentDialog } from "./attachment-dialog"
import { QuickReplyMenu } from "./quick-reply-menu"
import { RecorderWaveform } from "./waveform"

const EmojiPicker = lazy(() => import("./emoji-picker"))

/** Só busca, para `/` abrir sem espera. À parte, para a revalidação não desenhar o composer. */
export function QuickRepliesPrefetch() {
  useQuickReplies()
  return null
}

export type { ComposerHandle }

/** O que toda caixa de escrever recebe: a da tela larga e a do celular. */
export type ComposerBoxProps = {
  chatId: string
  chat: Chat
  contactName: string
  onSent: () => void
  ref?: Ref<ComposerHandle>
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
export const ReplyBar = memo(function ReplyBar({
  chatId,
  contactName,
  className,
}: {
  chatId: string
  contactName: string
  className?: string
}) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const message = useReplyTo((state) => state.byChat[chatId])
  const clear = useReplyTo((state) => state.clearReplyTo)

  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.div key="reply" {...preset.slideUp} className={cn("flex items-center gap-1 pb-2", className)}>
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
 *
 * Uma pílula clara presa logo acima do composer, com um ponto violeta: o ponto é o único sinal de
 * "algo está agindo aqui", e o texto continua no cinza da interface. Pausada com hora para voltar, o
 * ponto fica cinza. Ao responder, a pílula desce para dentro do composer e some: é a pausa
 * acontecendo diante de quem respondeu.
 */
export const AutomationHint = memo(function AutomationHint({
  chat,
  short = false,
}: {
  chat: Chat
  /** No celular, uma linha: a frase inteira tiraria espaço da conversa toda vez. */
  short?: boolean
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()

  const state = chat.partial
    ? null
    : chat.automationEnabled
      ? "on"
      : chat.automationResumeAt
        ? "resumes"
        : null

  const motionProps = preset.reduced
    ? preset.fade
    : {
        initial: { opacity: 0, y: 6, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 6, scale: 0.97 },
        transition: preset.spring,
      }

  return (
    <AnimatePresence initial={false}>
      {state ? (
        <motion.div key={state} {...motionProps} className="flex justify-center pb-1.5">
          <p
            role="status"
            className="inline-flex max-w-full items-center gap-2 rounded-full bg-card/95 px-3 py-1 text-xs leading-4 text-muted-foreground shadow-xs ring-1 ring-border/60"
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                state === "on" ? "bg-primary" : "bg-muted-foreground/50"
              )}
            />
            <span className="min-w-0">
              {state === "on"
                ? t(short ? "chatMobile.composer.automationOn" : "chat.composer.automationOn")
                : t("chat.composer.automationResumes", {
                    when: formatRelative(chat.automationResumeAt as number, language),
                  })}
            </span>
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
})

/**
 * A folga sob o composer soma a área segura do aparelho, mas não com o teclado aberto: aí quem fica
 * embaixo é o teclado, e a folga viraria um buraco entre os dois.
 */
export const BOTTOM_PADDING = "pb-[calc(0.75rem_+_max(0px,_var(--app-safe-bottom)_-_var(--kb-inset,_0px)))]"

/** No lugar do composer, onde só dá para ler: a aba "Todos" de um contato. */
export function ReadOnlyNotice() {
  const { t } = useTranslation()

  return (
    <div className={cn("flex shrink-0 justify-center px-4 pt-2", BOTTOM_PADDING)}>
      <p className="rounded-full bg-card/95 px-3.5 py-1.5 text-center text-sm text-muted-foreground shadow-xs ring-1 ring-border/60">
        {t("chat.composer.readOnly")}
      </p>
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
    <div className={cn("shrink-0 px-3 pt-2 md:px-5", BOTTOM_PADDING)}>
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

/** Onde se escreve: a caixa, ou o aviso de por que não dá. `Box` é a caixa do tamanho de tela. */
export const Composer = memo(function Composer({
  chatId,
  mode,
  contactName,
  onSent,
  Box = ComposerBox,
  ref,
}: {
  chatId: string
  mode: ComposerMode
  contactName: string
  onSent: () => void
  Box?: ComponentType<ComposerBoxProps>
  ref?: Ref<ComposerHandle>
}) {
  const chat = useChat(chatId)

  if (!chat) return null
  if (mode !== "compose") return <ComposerNotice chat={chat} mode={mode} />

  // A caixa nasce de novo a cada conversa aberta: sem isto, cada troca de conversa buscaria outra vez
  // mensagens rápidas e anexos. Quem as atualiza é o menu, quando abre.
  return (
    <SWRConfig value={REFERENCE_DATA}>
      <Box chatId={chatId} chat={chat} contactName={contactName} onSent={onSent} ref={ref} />
    </SWRConfig>
  )
})

/**
 * À direita, o microfone; com texto, enviar. Os dois ocupam o mesmo lugar e trocam com fade e
 * escala curtos: a pessoa vê o botão virar, em vez de um piscar. Enviar é o único violeta cheio do
 * composer, porque é a ação principal.
 */
const SendOrRecord = memo(function SendOrRecord({
  hasText,
  onSend,
  onRecord,
}: {
  hasText: boolean
  onSend: () => void
  onRecord: () => void
}) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const hidden = preset.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }
  const transition = preset.reduced ? { duration: 0.15 } : preset.spring

  return (
    <span className="grid shrink-0 place-items-center">
      <AnimatePresence initial={false}>
        {hasText ? (
          <motion.span
            key="send"
            className="[grid-area:1/1]"
            initial={hidden}
            animate={{ opacity: 1, scale: 1 }}
            exit={hidden}
            transition={transition}
          >
            <Button
              type="button"
              size="icon"
              className="rounded-full pointer-coarse:size-10"
              aria-label={t("chat.composer.send")}
              title={t("chat.composer.send")}
              onClick={onSend}
            >
              <SendHorizontal />
            </Button>
          </motion.span>
        ) : (
          <motion.span
            key="mic"
            className="[grid-area:1/1]"
            initial={hidden}
            animate={{ opacity: 1, scale: 1 }}
            exit={hidden}
            transition={transition}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground pointer-coarse:size-10"
              aria-label={t("chat.recorder.start")}
              title={t("chat.recorder.start")}
              onClick={onRecord}
            >
              <Mic />
            </Button>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
})

function ComposerBox({ chatId, chat, contactName, onSent, ref }: ComposerBoxProps) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const {
    textarea,
    attachments,
    quickReplyMenu,
    hasText,
    slash,
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

  const composerActions = useMemo(
    () => (
      <ComposerExtras chat={chat} insertText={insertText} disabled={recorder.isBusy} />
    ),
    [chat, insertText, recorder.isBusy]
  )

  return (
    <div className={cn("relative shrink-0 px-3 pt-1 md:px-5", BOTTOM_PADDING)}>
      <QuickRepliesPrefetch />
      <AutomationHint chat={chat} />

      <div className="relative">
        {slash ? (
          <QuickReplyMenu
            ref={quickReplyMenu}
            query={slash.query}
            context={fillContext}
            onPick={pickQuickReply}
          />
        ) : null}

        {/* O cartão flutua sobre a conversa: branco, cantos bem redondos e sombra baixa. Resposta
            citada e avisos moram dentro dele, porque são sobre o que está sendo escrito. */}
        <div className="overflow-hidden rounded-[1.375rem] bg-card shadow-lg ring-1 shadow-foreground/[0.06] ring-border/70 transition-shadow focus-within:ring-ring/60">
          <ReplyBar chatId={chatId} contactName={contactName} className="px-2 pt-2 pb-0" />

          {unfilled ? (
            <p role="status" className="flex items-start gap-1.5 px-3.5 pt-2 text-xs text-status-warning">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">{t("chat.composer.unfilledVariable", { marker: unfilled })}</span>
            </p>
          ) : null}

          {notice ? (
            <p role="alert" className="flex items-center justify-between gap-2 pt-1 pr-1.5 pl-3.5 text-xs text-status-warning">
              {notice}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="pointer-coarse:size-10"
                aria-label={t("chat.recorder.dismiss")}
                onClick={recorder.dismissNotice}
              >
                <X />
              </Button>
            </p>
          ) : null}

          <AnimatePresence initial={false} mode="popLayout">
            {recorder.isBusy ? (
              <motion.div
                key="recorder"
                {...preset.fade}
                className="flex min-h-12 items-center gap-1 px-2 py-1.5"
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
              <motion.div key="text" {...preset.fade} className="flex min-h-12 items-end gap-0.5 px-2 py-1.5">
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
                  className="max-h-40 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-5 outline-none placeholder:text-muted-foreground md:text-sm pointer-coarse:min-h-10 pointer-coarse:py-2.5"
                />

                <SendOrRecord
                  hasText={hasText}
                  onSend={submit}
                  onRecord={() => void recorder.start()}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AttachmentDialog ref={attachments} chatId={chatId} onSent={onAttachmentsSent} />
    </div>
  )
}
