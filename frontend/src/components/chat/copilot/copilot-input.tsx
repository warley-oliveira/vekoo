import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, SendHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCredits } from "@/hooks/use-credits"
import { useIsTouch } from "@/hooks/use-media-query"
import {
  COPILOT_MAX_CHARS,
  COPILOT_MESSAGE_COST,
  sendCopilotMessage,
  useCopilotStore,
} from "@/lib/chat-details/copilot-store"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const MAX_HEIGHT = 120

// O que estava sendo escrito sobrevive a ir até a aba do contato e voltar.
let draft = ""

/**
 * Onde se pergunta. Não é controlada, como o composer da conversa: digitar não desenha nada acima. O
 * custo fica à vista, porque cada mensagem gasta crédito da organização.
 */
export const CopilotInput = memo(function CopilotInput() {
  const { t } = useTranslation()
  const language = useLanguage()
  const isTouch = useIsTouch()
  const { credits } = useCredits()
  const connected = useCopilotStore((state) => state.connected)
  const busy = useCopilotStore((state) => Boolean(state.live))
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [hasText, setHasText] = useState(() => draft.trim().length > 0)

  const left = credits?.left
  const outOfCredits = left !== undefined && left < COPILOT_MESSAGE_COST
  const disabled = !connected || outOfCredits

  const resize = useCallback(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`
  }, [])

  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.value = draft
    resize()
  }, [resize])

  const submit = () => {
    const element = textarea.current
    if (!element || busy || disabled) return
    if (!sendCopilotMessage(element.value)) return

    element.value = ""
    draft = ""
    setHasText(false)
    resize()
    if (!isTouch) element.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    // Com dedo, Enter quebra linha: quem envia é o botão.
    if (event.key === "Enter" && !event.shiftKey && !isTouch) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="shrink-0 border-t px-3 pt-2 pb-[calc(0.5rem_+_max(0px,_var(--app-safe-bottom,_0px)_-_var(--kb-inset,_0px)))]">
      <div className="flex items-end gap-1 rounded-2xl border bg-background px-1.5 py-1 transition-colors focus-within:border-ring/70">
        <textarea
          ref={textarea}
          rows={1}
          maxLength={COPILOT_MAX_CHARS}
          disabled={disabled}
          aria-label={t("chatDetails.copilot.inputLabel")}
          placeholder={
            outOfCredits
              ? t("chatDetails.copilot.outOfCreditsPlaceholder")
              : connected
                ? t("chatDetails.copilot.placeholder")
                : t("chatDetails.copilot.connecting")
          }
          onInput={(event) => {
            draft = event.currentTarget.value
            const filled = draft.trim().length > 0
            setHasText((current) => (current === filled ? current : filled))
            resize()
          }}
          onKeyDown={onKeyDown}
          className="max-h-30 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-base leading-5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm pointer-coarse:min-h-10 pointer-coarse:py-2.5"
        />
        <Button
          type="button"
          size="icon"
          disabled={!hasText || busy || disabled}
          aria-label={t("chatDetails.copilot.send")}
          title={t("chatDetails.copilot.send")}
          className={cn("shrink-0 rounded-full pointer-coarse:size-10")}
          onClick={submit}
        >
          {busy ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </div>
      <p className="mt-1 px-1 text-[0.6875rem] text-muted-foreground">
        {t("chatDetails.copilot.cost", { count: COPILOT_MESSAGE_COST })}
        {left !== undefined
          ? ` · ${t("chatDetails.copilot.balance", { count: left, formatted: formatNumber(left, language) })}`
          : null}
      </p>
    </div>
  )
})
