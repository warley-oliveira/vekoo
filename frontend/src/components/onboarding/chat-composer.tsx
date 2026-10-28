import { useImperativeHandle, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUp, ImagePlus, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/** O teto do servidor para uma resposta (`AgentTurn` valida 2 000). */
const MAX_CHARS = 2_000

/** O `id` do campo: quem quer devolver o foco a ele (o "Ajustar algo") usa este. */
export const COMPOSER_ID = "onboarding-answer"

/** Quem precisa pôr texto no campo de fora — o "← voltar" devolve a resposta anterior. */
export type ChatComposerHandle = {
  fill: (text: string) => void
}

type ChatComposerProps = {
  ref?: Ref<ChatComposerHandle>
  /** Rejeita quando não foi: o texto fica no campo para tentar de novo. */
  onSend: (text: string) => Promise<void>
  /** O chip "não sei — cria pra mim" — só nos temas que têm proposta. */
  onSuggest?: () => void
  /** A logo, na pergunta da logo. */
  onLogo?: (file: File) => Promise<void>
  busy: boolean
}

/**
 * O campo da conversa. Pensado para o celular de pé, numa mão só: o campo e
 * o botão de enviar ficam embaixo, onde o polegar alcança, e o chip mora logo
 * acima do campo — é a saída de quem travou, não um menu.
 *
 * Enter envia, Shift+Enter quebra linha. Enquanto o agente lê a resposta, o
 * campo continua aberto para escrever, mas não envia: uma fala de cada vez.
 */
export function ChatComposer({ ref, onSend, onSuggest, onLogo, busy }: ChatComposerProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    fill(text) {
      setValue(text.slice(0, MAX_CHARS))
      // O foco vai com o cursor no fim: é para editar, não redigitar.
      window.requestAnimationFrame(() => {
        const element = field.current
        if (!element) return
        element.focus()
        element.setSelectionRange(element.value.length, element.value.length)
      })
    },
  }))

  const locked = busy || sending || uploading
  const canSend = value.trim().length > 0 && !locked

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!canSend) return
    setSending(true)
    try {
      await onSend(value.trim())
      setValue("")
    } catch {
      // Quem chamou já avisou; o texto fica para ela tentar de novo.
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  async function attach(file: File | undefined) {
    if (!file || !onLogo) return
    setUploading(true)
    try {
      await onLogo(file)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {onSuggest && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: 4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <button
              type="button"
              onClick={onSuggest}
              disabled={locked}
              className={cn(
                "inline-flex h-10 items-center rounded-full border bg-background px-4 font-mono text-xs outline-none transition-colors",
                "enabled:hover:border-vk-fg enabled:hover:text-vk-fg focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              )}
            >
              {t("onboarding.chip")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={submit}
        className="flex items-end gap-1.5 rounded-vk border border-vk-border bg-vk-input p-1.5 transition-colors focus-within:border-vk-fg"
      >
        {onLogo && (
          <>
            <input
              ref={fileInput}
              type="file"
              // Logo de WhatsApp vem em JPEG: o servidor converte para PNG.
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void attach(event.target.files?.[0])}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-xl"
              onClick={() => fileInput.current?.click()}
              disabled={locked}
              aria-label={t("onboarding.a11y.attachLogo")}
            >
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
            </Button>
          </>
        )}
        <Textarea
          ref={field}
          id={COMPOSER_ID}
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, MAX_CHARS))}
          onKeyDown={onKeyDown}
          rows={1}
          enterKeyHint="send"
          placeholder={t("onboarding.placeholder")}
          aria-label={t("onboarding.placeholder")}
          // `field-sizing-content` cresce com o texto; o teto evita que uma
          // resposta longa empurre o botão para fora da tela do celular.
          className="max-h-40 min-h-10 resize-none border-0 bg-transparent px-2.5 py-2.5 text-base shadow-none placeholder:text-vk-muted focus-visible:border-transparent focus-visible:ring-0 md:text-[15px]"
        />
        <Button
          type="submit"
          size="icon"
          className="size-10 shrink-0 rounded-full bg-vk-btn text-vk-btn-fg hover:bg-vk-btn-hover focus-visible:ring-vk-fg/30"
          disabled={!canSend}
          aria-label={t("onboarding.a11y.send")}
        >
          {sending ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowUp aria-hidden />}
        </Button>
      </form>
    </div>
  )
}
