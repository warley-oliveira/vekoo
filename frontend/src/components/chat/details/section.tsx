import { useId, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { ChevronRight, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { useDetailsPrefs, type SectionId } from "@/lib/chat-details/panel-store"
import { cn } from "@/lib/utils"

/**
 * Um assunto do painel, que a pessoa dobra e desdobra. A escolha vale para todas as conversas, e fica:
 * quem nunca olha os campos não precisa fechar a seção a cada contato. O que vem junto no título
 * (`summary`) continua à vista com a seção dobrada.
 */
export function DetailsSection({
  id,
  title,
  count,
  summary,
  action,
  children,
}: {
  id: SectionId
  title: string
  /** Quantos há. Não aparece enquanto é zero. */
  count?: number
  /** Uma palavra à direita do título: o que está dentro, sem precisar abrir. */
  summary?: ReactNode
  /** Botão à direita, como "adicionar". */
  action?: ReactNode
  children: ReactNode
}) {
  const language = useLanguage()
  const preset = useMotionPreset()
  const bodyId = useId()
  const collapsed = useDetailsPrefs((state) => Boolean(state.collapsed[id]))
  const toggle = useDetailsPrefs((state) => state.toggleSection)

  return (
    <section className="border-t px-4 py-2.5">
      <div className="flex min-h-8 items-center gap-1 pointer-coarse:min-h-10">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => toggle(id)}
          className="group/section flex min-w-0 flex-1 items-center gap-1 self-stretch rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "-ml-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover/section:text-foreground",
              !collapsed && "rotate-90"
            )}
          />
          <span className="truncate text-[0.8125rem] font-medium">{title}</span>
          {count ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatNumber(count, language)}
            </span>
          ) : null}
          {summary ? (
            <span className="ml-auto min-w-0 truncate pl-2 text-xs text-muted-foreground">
              {summary}
            </span>
          ) : null}
        </button>
        {action ? <span className="flex shrink-0 items-center">{action}</span> : null}
      </div>

      <AnimatePresence initial={false}>
        {collapsed ? null : (
          <motion.div key="body" id={bodyId} {...preset.fade} className="pt-1 pb-1">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** A linha de uma coisa só: rótulo à esquerda, o que dá para mudar à direita. */
export function PropertyRow({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="grid min-h-9 grid-cols-[6.25rem_minmax(0,1fr)] items-center gap-2 pointer-coarse:min-h-10">
      <label htmlFor={htmlFor} className="truncate text-[0.8125rem] text-muted-foreground">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1">{children}</div>
    </div>
  )
}

/** Campo sem moldura até a pessoa chegar nele: o painel não pode parecer um formulário. */
export const QUIET_FIELD =
  "border-transparent bg-transparent shadow-none transition-colors hover:border-input focus-within:border-ring dark:bg-transparent"

/** Falhou ao carregar uma seção: uma linha, com tentar de novo. O resto do painel segue valendo. */
export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <div role="alert" className="flex items-center justify-between gap-2 rounded-md py-1 text-sm">
      <span className="min-w-0 text-muted-foreground">{message}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 pointer-coarse:h-10"
        onClick={onRetry}
      >
        <RefreshCw />
        {t("chatDetails.retry")}
      </Button>
    </div>
  )
}

/** Carregando dentro de uma seção: linhas do tamanho das que vão entrar. */
export function SectionRowsSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-2 py-1">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2.5">
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** O vazio de uma seção estreita: uma frase e, se houver, o próximo passo. */
export function SectionEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-0.5">
      <p className="min-w-0 text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  )
}

/** Mostrar o resto de uma lista curta. */
export function ShowMoreButton({
  expanded,
  hiddenCount,
  onToggle,
}: {
  expanded: boolean
  hiddenCount: number
  onToggle: () => void
}) {
  const { t } = useTranslation()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 text-muted-foreground pointer-coarse:h-10"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {expanded ? t("chatDetails.showLess") : t("chatDetails.showMore", { count: hiddenCount })}
    </Button>
  )
}
