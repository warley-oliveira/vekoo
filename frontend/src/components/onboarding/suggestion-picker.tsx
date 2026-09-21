import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, RefreshCw, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useOnboarding } from "@/hooks/use-onboarding"
import type { SuggestKind, SuggestOption } from "@/lib/onboarding"
import { cn } from "@/lib/utils"

type SuggestionPickerProps<T extends SuggestOption> = {
  brandId: string
  kind: SuggestKind
  /** Desenha uma proposta. O quadro, a seleção e o teclado são daqui. */
  render: (option: T, selected: boolean) => ReactNode
  onSelect: (option: T, index: number) => void
  selectedIndex: number | null
  /** Busca as propostas assim que a tela abre (cor e fonte fazem isso). */
  auto?: boolean
  label: string
}

/**
 * O "não sei / cria pra mim": duas ou três propostas para escolher.
 *
 * A regra é do produto, não da tela: **nunca uma opção só**. Quem clicou aqui
 * já disse que não sabe responder — e quem não sabe responder também não sabe
 * julgar uma proposta isolada. Comparar é mais fácil do que decidir do zero.
 *
 * Também nunca falha: sem modelo disponível o servidor devolve propostas
 * curadas, e a tela não muda de forma por causa disso. Um "deu erro" aqui
 * seria a pior resposta possível para quem acabou de pedir ajuda.
 */
export function SuggestionPicker<T extends SuggestOption>({
  brandId,
  kind,
  render,
  onSelect,
  selectedIndex,
  auto,
  label,
}: SuggestionPickerProps<T>) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const { suggest } = useOnboarding(brandId)
  const [options, setOptions] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [asked, setAsked] = useState(false)

  async function ask() {
    setLoading(true)
    try {
      const result = await suggest<T>(kind)
      setOptions(result.options)
      setAsked(true)
    } catch {
      toast.error(t("onboarding.suggest.failed"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (auto && !asked && !loading) void ask()
    // Uma vez por montagem: a tela abre já com as propostas na mão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto])

  if (!asked && !loading) {
    return (
      <Button variant="outline" onClick={() => void ask()}>
        <Sparkles /> {t("onboarding.suggest.cta")}
      </Button>
    )
  }

  if (loading && options.length === 0) {
    return (
      <div className="space-y-3" aria-busy aria-label={t("onboarding.suggest.loading")}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3" aria-label={label}>
        <AnimatePresence initial={false}>
          {options.map((option, index) => {
            const selected = selectedIndex === index
            return (
              <motion.li
                key={index}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut", delay: reduced ? 0 : index * 0.05 }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(option, index)}
                  aria-pressed={selected}
                  className={cn(
                    "relative w-full overflow-hidden rounded-xl border p-1 text-left outline-none transition-colors",
                    "hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected ? "border-primary ring-3 ring-ring/30" : "border-border"
                  )}
                >
                  {selected && (
                    <span className="absolute top-3 right-3 z-10 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" aria-hidden />
                    </span>
                  )}
                  {render(option, selected)}
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <Button variant="ghost" size="sm" onClick={() => void ask()} disabled={loading}>
        <RefreshCw className={loading ? "animate-spin" : undefined} /> {t("onboarding.suggest.again")}
      </Button>
    </div>
  )
}
