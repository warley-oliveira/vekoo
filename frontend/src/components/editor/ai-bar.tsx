import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUp, Coins, Loader2, Sparkles, Square } from "lucide-react"

import { useAi } from "@/components/editor/ai-store"
import { createSuggestions } from "@/components/create-carousel-dialog"
import { Button } from "@/components/ui/button"
import { aiCost } from "@/lib/ai"
import { cn } from "@/lib/utils"

// A barra de geração flutua: em vez de comer uma faixa do editor, ela sobe
// sobre o card quando é chamada e sai quando termina. Em telas pequenas isso
// é a diferença entre sobrar e não sobrar espaço para o trabalho.
//
// O acento violeta é o único saturado aqui — brilho, borda viva e foco saem
// todos dele. Enquanto gera, a borda gira: é o sinal de que algo acontece,
// e some assim que para. Sob `prefers-reduced-motion` nada disso roda.

const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const

export function AiBar({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { task, busy, creditsLeft, runCarousel, cancel } = useAi()
  const reducedMotion = useReducedMotion()
  const field = useRef<HTMLTextAreaElement>(null)
  const [prompt, setPrompt] = useState("")

  const enough = creditsLeft >= aiCost().carousel
  const valid = prompt.trim().length > 0 && enough && !busy
  const generating = task?.kind === "carousel"

  // Gerando, a barra precisa estar visível — é onde mora o botão de parar.
  useEffect(() => {
    if (busy) onOpenChange(true)
  }, [busy, onOpenChange])

  // O campo cresce com o texto em vez de rolar dentro de duas linhas fixas.
  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [prompt, open, generating])

  // Esc fecha mesmo com o foco fora do campo — menos quando está gerando,
  // onde a saída é parar, não sumir.
  useEffect(() => {
    if (!open || busy) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      e.preventDefault()
      onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onOpenChange, open])

  function submit() {
    if (!valid) return
    void runCarousel(prompt.trim())
  }

  function dismiss() {
    if (busy) return
    onOpenChange(false)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={dismiss}
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("editor.ai.title")}
            layout={!reducedMotion}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={reducedMotion ? { duration: 0.15 } : SPRING}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation()
                dismiss()
              }
            }}
            className="relative m-3 w-[min(40rem,calc(100vw-1.5rem))] sm:mb-3"
          >
            <Glow active={generating} reducedMotion={Boolean(reducedMotion)} />

            {/* Casca de 1px: é dela que sai a borda viva da geração. */}
            <div className="relative overflow-hidden rounded-2xl p-px shadow-2xl">
              <LiveBorder active={generating} reducedMotion={Boolean(reducedMotion)} />

              <div className="relative rounded-[calc(1rem-1px)] bg-popover">
                <div className="flex items-start gap-3 p-3">
                  <Mark generating={generating} reducedMotion={Boolean(reducedMotion)} />

                  <div className="min-w-0 flex-1">
                    <AnimatePresence mode="wait" initial={false}>
                      {generating ? (
                        <motion.div
                          key="generating"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="flex min-h-9 items-center"
                        >
                          <ShimmerText reducedMotion={Boolean(reducedMotion)}>
                            {t("editor.ai.generating", { count: task.produced })}
                          </ShimmerText>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="asking"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="space-y-2"
                        >
                          <textarea
                            ref={field}
                            autoFocus
                            rows={1}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                submit()
                              }
                            }}
                            placeholder={t("editor.ai.placeholder")}
                            aria-label={t("editor.ai.placeholder")}
                            className={cn(
                              "block w-full resize-none bg-transparent pt-1.5 text-sm leading-relaxed",
                              "outline-none placeholder:text-muted-foreground"
                            )}
                          />

                          <div className="flex flex-wrap items-center gap-1.5">
                            {createSuggestions().map((suggestion, i) => (
                              <motion.button
                                key={suggestion}
                                type="button"
                                initial={
                                  reducedMotion ? false : { opacity: 0, y: 4 }
                                }
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  delay: reducedMotion ? 0 : 0.06 + i * 0.05,
                                  duration: 0.2,
                                  ease: "easeOut",
                                }}
                                onClick={() => {
                                  setPrompt(suggestion)
                                  field.current?.focus()
                                }}
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-xs text-muted-foreground",
                                  "transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground",
                                  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                )}
                              >
                                {suggestion}
                              </motion.button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {busy ? (
                    <Button variant="outline" size="sm" onClick={cancel}>
                      <Square className="fill-current" />
                      {t("editor.ai.stop")}
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      disabled={!valid}
                      aria-label={t("editor.ai.generate")}
                      onClick={submit}
                      className="rounded-full"
                    >
                      <ArrowUp />
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t px-3 py-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                    <Coins className="size-3" />
                    {t("editor.ai.cost", { count: aiCost().carousel })}
                  </span>
                  {!enough && (
                    <span role="alert" className="text-[11px] text-destructive">
                      {t("editor.ai.errors.noCredits")}
                    </span>
                  )}
                  <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
                    {t("editor.ai.hint")}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** Aura violeta atrás da barra — respira devagar enquanto gera. */
function Glow({
  active,
  reducedMotion,
}: {
  active: boolean
  reducedMotion: boolean
}) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-primary/25 blur-2xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: active && !reducedMotion ? [0.5, 0.85, 0.5] : 0.35 }}
      transition={
        active && !reducedMotion
          ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.3 }
      }
    />
  )
}

/** Borda viva: um cone de luz girando sob a casca de 1px. */
function LiveBorder({
  active,
  reducedMotion,
}: {
  active: boolean
  reducedMotion: boolean
}) {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 rounded-2xl bg-border transition-opacity duration-300"
        style={{ opacity: active ? 0 : 1 }}
      />
      <AnimatePresence>
        {active && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: reducedMotion ? 0 : 360 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.3 },
              rotate: reducedMotion
                ? { duration: 0 }
                : { duration: 3.2, repeat: Infinity, ease: "linear" },
            }}
            className="absolute top-1/2 left-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, var(--primary) 70deg, transparent 150deg, transparent 210deg, var(--primary) 280deg, transparent 350deg)",
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

/** O selo da geração: pulsa devagar enquanto escreve. */
function Mark({
  generating,
  reducedMotion,
}: {
  generating: boolean
  reducedMotion: boolean
}) {
  return (
    <motion.span
      aria-hidden
      animate={
        generating && !reducedMotion
          ? { scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }
          : { scale: 1, opacity: 1 }
      }
      transition={
        generating && !reducedMotion
          ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.2 }
      }
      className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"
    >
      <Sparkles className="size-3.5" />
    </motion.span>
  )
}

/** Texto com um brilho que atravessa — só enquanto há coisa acontecendo. */
function ShimmerText({
  children,
  reducedMotion,
}: {
  children: string
  reducedMotion: boolean
}) {
  if (reducedMotion) {
    return (
      <p role="status" className="text-sm">
        {children}
      </p>
    )
  }

  return (
    <motion.p
      role="status"
      className="bg-clip-text text-sm text-transparent"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 35%, var(--primary) 50%, var(--muted-foreground) 65%, var(--muted-foreground) 100%)",
        backgroundSize: "220% 100%",
      }}
      animate={{ backgroundPositionX: ["120%", "-120%"] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.p>
  )
}

/** Botão do topo — mostra a atividade quando há geração em curso. */
export function AiTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  const { busy } = useAi()

  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
      <span className="hidden sm:inline">{t("editor.ai.trigger")}</span>
    </Button>
  )
}
