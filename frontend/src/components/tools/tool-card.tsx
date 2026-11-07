import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { KeyRound } from "lucide-react"

import { StatusBadge } from "@/components/shared"
import type { ToolBrand } from "@/lib/tools/types"
import { cn } from "@/lib/utils"

import { useToolTexts } from "./tool-texts"
import { ToolLogo } from "./tool-logo"

export type ToolCardProps = {
  tool: Pick<ToolBrand, "name" | "slug" | "icon" | "imageUrl"> & { description: string }
  /** "Utilidades", "Clientes e vendas". */
  categoryLabel: string
  functionCount: number
  /** Precisa de chave de outro sistema: quem instala fica sabendo antes de abrir. */
  needsCredentials?: boolean
  /** Instalada e desligada: a IA não usa. */
  off?: boolean
  /** O interruptor ou o botão de instalar. Fica acima da área clicável do cartão. */
  control?: ReactNode
  onOpen: () => void
}

/**
 * Uma ferramenta: o cartão inteiro abre o painel, e o botão de verdade é o título, para o teclado e o leitor de tela
 * o acharem.
 */
export function ToolCard({ tool, categoryLabel, functionCount, needsCredentials, off, control, onOpen }: ToolCardProps) {
  const { t } = useTranslation()
  const texts = useToolTexts()

  return (
    <article className="relative flex h-full min-h-36 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40">
      <div className="flex items-start gap-3">
        <ToolLogo tool={tool} className={cn(off && "opacity-50")} />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base leading-snug font-medium">
            <button
              type="button"
              onClick={onOpen}
              className={cn(
                "rounded text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50",
                off && "text-muted-foreground"
              )}
            >
              {texts.name(tool)}
            </button>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>{categoryLabel}</span>
            <span aria-hidden>·</span>
            <span>{t("tools.card.functions", { count: functionCount })}</span>
            {needsCredentials ? (
              <span className="inline-flex items-center gap-1">
                <KeyRound className="size-3" aria-hidden />
                {t("tools.card.needsCredentials")}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <p className="line-clamp-3 text-sm text-pretty text-muted-foreground">{texts.description(tool)}</p>
      {control || off ? (
        <div className="mt-auto flex items-center justify-between gap-2">
          {off ? <StatusBadge tone="neutral">{t("tools.card.off")}</StatusBadge> : <span />}
          {/* Acima do `after` do título: clicar aqui não abre o painel. */}
          <div className="relative z-10">{control}</div>
        </div>
      ) : null}
    </article>
  )
}
