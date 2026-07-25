import { useState } from "react"
import { ArrowRight, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// A porta de entrada da geração — que só chega na próxima etapa. O fluxo de
// descrever o assunto já existe (e é o mesmo do estado vazio), mas o submit
// avisa honestamente que a geração ainda não está ligada.

export const CREATE_SUGGESTIONS = [
  "5 dicas de lanche saudável para levar pro trabalho",
  "Promoção da semana da minha loja de roupas",
  "Como funciona o financiamento do primeiro imóvel",
]

export function submitCreateIdea(idea: string) {
  toast("Sua ideia ficou guardada!", {
    description: `“${truncate(idea, 80)}” — a geração de carrosséis chega na próxima etapa.`,
  })
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

type CreateCarouselDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateCarouselDialog({
  open,
  onOpenChange,
}: CreateCarouselDialogProps) {
  const [idea, setIdea] = useState("")
  const valid = idea.trim().length > 0

  function submit() {
    if (!valid) return
    submitCreateIdea(idea.trim())
    setIdea("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            Sobre o que é o seu carrossel?
          </DialogTitle>
          <DialogDescription>
            Descreva o assunto em uma frase — o Vekoo monta os cards para você.
          </DialogDescription>
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
            placeholder="Ex.: 5 erros comuns de quem começa a treinar em casa"
            className="w-full resize-none rounded-lg border bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex flex-wrap gap-1.5">
            {CREATE_SUGGESTIONS.map((suggestion) => (
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
            <Sparkles /> Criar carrossel <ArrowRight />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
