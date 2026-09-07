import { useCallback, useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { ArrowRight, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// A porta de entrada da geração. Descrever o assunto cria o carrossel de
// verdade e abre o editor já gerando — a espera acontece lá, onde os cards
// aparecem, e não num diálogo parado.

import { useCarouselMutations } from "@/hooks/use-carousel-mutations"
import { suggestTheme, suggestTitle } from "@/lib/ai"
import { emptyCard, newId } from "@/lib/doc"
import i18n from "@/lib/i18n"

const SUGGESTION_KEYS = ["first", "second", "third"] as const

/**
 * Sugestões de assunto, no idioma ativo. Chaves de texto simples de propósito:
 * `returnObjects` para ler um array do bundle não é confiável junto com
 * `supportedLngs` + `load: "currentOnly"` — devolve a própria chave.
 */
export function createSuggestions(): string[] {
  return SUGGESTION_KEYS.map((key) => i18n.t(`create.suggestions.${key}`))
}

/**
 * Cria o carrossel a partir da ideia e leva para o editor, que recebe o texto
 * em `location.state` e começa a gerar sozinho.
 *
 * Agora é assíncrono: o id vem do servidor, e é ele que compõe a URL do editor.
 * Por isso a tela precisa mostrar que está trabalhando — daí o `creating`.
 */
export function useCreateCarousel() {
  const { create } = useCarouselMutations()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const run = useCallback(
    async (idea: string, folderId: string | null = null) => {
      setCreating(true)
      try {
        const carousel = await create({
          title: suggestTitle(idea) || i18n.t("create.untitled"),
          format: "4:5",
          theme: suggestTheme(idea),
          cards: [emptyCard(newId("card"))],
          folderId,
        })
        navigate(`/carousels/${carousel.id}/edit`, { state: { generate: idea } })
        return carousel
      } catch {
        toast.error(i18n.t("carousels.actions.createFailed"))
        return null
      } finally {
        setCreating(false)
      }
    },
    [create, navigate]
  )

  return { create: run, creating }
}

type CreateCarouselDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateCarouselDialog({
  open,
  onOpenChange,
}: CreateCarouselDialogProps) {
  const { t } = useTranslation()
  const { create, creating } = useCreateCarousel()
  const [idea, setIdea] = useState("")
  const valid = idea.trim().length > 0 && !creating

  // O diálogo só fecha quando o carrossel existe de verdade: se a criação
  // falhar, o texto continua aqui para a pessoa tentar de novo sem redigitar.
  async function submit() {
    if (!valid) return
    const created = await create(idea.trim())
    if (created) {
      onOpenChange(false)
      setIdea("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {t("create.title")}
          </DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <textarea
            autoFocus
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={3}
            placeholder={t("create.placeholder")}
            className="w-full resize-none rounded-lg border bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex flex-wrap gap-1.5">
            {createSuggestions().map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setIdea(suggestion)}
                className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors outline-none hover:border-ring/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={!valid} onClick={submit}>
            {creating ? (
              <>
                <Loader2 className="animate-spin" /> {t("create.submitting")}
              </>
            ) : (
              <>
                <Sparkles /> {t("create.submit")} <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
