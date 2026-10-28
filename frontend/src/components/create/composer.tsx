import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUp, ImagePlus, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useBrandCoreMutations } from "@/hooks/use-brand-core"
import { PLACEHOLDER_COUNT } from "@/lib/agent"
import { useCatalog } from "@/lib/catalog"
import { cn } from "@/lib/utils"

const ROTATION_MS = 4200
const MAX_CHARS = 2000

export type ComposerAttachment = { id: string; name: string; url: string }
type Attachment = ComposerAttachment

type ComposerProps = {
  brandId: string
  onSubmit: (prompt: string, attachments: string[]) => Promise<void>
  disabled?: boolean
  busy?: boolean
  /** `hero` é o campo grande da tela vazia; `bar` é o compositor do rodapé. */
  variant?: "hero" | "bar"
  autoFocus?: boolean
  placeholderKey?: string
  /** Quanto o pedido vai custar em créditos — o ajuste custa menos. */
  cost?: number
  /**
   * Uma foto que chega de fora — o "usar numa peça" de uma foto criada. Entra
   * como anexo e o foco vai para o campo; `nonce` muda a cada pedido, para a
   * mesma foto poder voltar depois de removida.
   */
  injected?: { attachment: ComposerAttachment; nonce: number } | null
}

/**
 * O campo único: a pessoa escreve o que quer e recebe a peça.
 *
 * O placeholder gira entre exemplos enquanto o campo está vazio e sem foco —
 * é o que ensina o que dá para pedir sem uma tela de ajuda. Ao focar ou
 * digitar, ele para: exemplo que se move debaixo do cursor atrapalha.
 */
export function Composer({
  brandId,
  onSubmit,
  disabled,
  busy,
  variant = "hero",
  autoFocus,
  placeholderKey = "agent.composer.examples",
  cost,
  injected,
}: ComposerProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const catalog = useCatalog()
  const { uploadAsset } = useBrandCoreMutations(brandId)
  const [value, setValue] = useState("")
  const [focused, setFocused] = useState(false)
  const [index, setIndex] = useState(0)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const examples = useMemo(
    () => Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => t(`${placeholderKey}.${i}`)),
    [placeholderKey, t]
  )
  const idle = value.length === 0 && !focused

  useEffect(() => {
    if (!idle) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % examples.length), ROTATION_MS)
    return () => window.clearInterval(timer)
  }, [idle, examples.length])

  useEffect(() => {
    if (!injected) return
    const { attachment } = injected
    setAttachments((current) => (current.some((a) => a.id === attachment.id) ? current : [...current, attachment]))
    window.requestAnimationFrame(() => document.getElementById("agent-prompt")?.focus())
  }, [injected])

  const canSend = value.trim().length > 0 && !disabled && !busy && !sending && !uploading

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!canSend) return
    setSending(true)
    try {
      await onSubmit(value.trim(), attachments.map((a) => a.id))
      setValue("")
      setAttachments([])
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia, Shift+Enter quebra linha: o gesto que todo mundo já tem.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }

  async function attach(file: File | undefined) {
    if (!file) return
    if (!catalog.uploadLimits.contentTypes.includes(file.type)) {
      toast.error(t("agent.composer.photoType"))
      return
    }
    if (file.size > catalog.uploadLimits.maxBytes) {
      toast.error(t("agent.composer.photoTooLarge"))
      return
    }
    setUploading(true)
    try {
      const asset = await uploadAsset("photo", null, file)
      setAttachments((current) => [...current, { id: asset.id, name: asset.name, url: asset.url }])
      toast.success(t("agent.composer.photoAdded"))
    } catch {
      toast.error(t("agent.composer.photoFailed"))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const hero = variant === "hero"

  return (
    <form
      onSubmit={submit}
      className={cn(
        "rounded-2xl border bg-card shadow-sm transition-shadow focus-within:ring-3 focus-within:ring-ring/50",
        hero ? "p-3" : "p-2"
      )}
    >
      <label className="sr-only" htmlFor="agent-prompt">
        {t("agent.composer.label")}
      </label>
      <div className="relative">
        <Textarea
          id="agent-prompt"
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, MAX_CHARS))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          rows={hero ? 2 : 1}
          disabled={disabled}
          aria-describedby="agent-prompt-hint"
          // `field-sizing-content` já cresce com o texto; o teto evita que uma
          // frase longa empurre o botão de enviar para fora da tela.
          className={cn(
            "min-h-0 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:border-transparent focus-visible:ring-0",
            hero ? "max-h-56 text-base md:text-lg" : "max-h-40 text-sm"
          )}
        />
        {/* O placeholder é nosso, e não o do `textarea`, porque ele gira. */}
        {value.length === 0 && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 flex items-start px-2 py-2 text-muted-foreground",
              hero ? "text-base md:text-lg" : "text-sm"
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={idle ? index : "focused"}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="truncate"
              >
                {idle ? examples[index] : t("agent.composer.placeholder")}
              </motion.span>
            </AnimatePresence>
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-2 pb-2" aria-label={t("agent.composer.attachmentsAria")}>
          {attachments.map((attachment) => (
            <motion.li
              key={attachment.id}
              className="relative"
              initial={reduced ? false : { opacity: 0, scale: 0.85, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", bounce: 0.08, duration: 0.4 }}
            >
              <img
                src={attachment.url}
                alt={attachment.name}
                className="size-14 rounded-md border object-cover"
              />
              <button
                type="button"
                onClick={() => setAttachments((c) => c.filter((a) => a.id !== attachment.id))}
                aria-label={t("agent.composer.removePhoto", { name: attachment.name })}
                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border bg-background text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-3" />
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1">
          <input
            ref={fileInput}
            type="file"
            accept={catalog.uploadLimits.contentTypes.join(",")}
            className="sr-only"
            onChange={(event) => void attach(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            <span className={hero ? "" : "sr-only sm:not-sr-only"}>{t("agent.composer.attach")}</span>
          </Button>
          <p id="agent-prompt-hint" className="hidden text-xs text-muted-foreground sm:block">
            {t("agent.composer.hint", { credits: cost ?? catalog.aiCosts.agent, image: catalog.aiCosts.image })}
          </p>
        </div>
        <Button type="submit" size={hero ? "default" : "sm"} disabled={!canSend} aria-label={t("agent.composer.send")}>
          {sending || busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          <span className="hidden sm:inline">{busy ? t("agent.composer.working") : t("agent.composer.send")}</span>
        </Button>
      </div>
    </form>
  )
}
