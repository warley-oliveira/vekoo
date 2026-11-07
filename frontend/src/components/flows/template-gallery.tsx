import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"

import { CardGridSkeleton, ErrorState } from "@/components/shared"
import { useFlowTemplates } from "@/hooks/flows/use-flows"
import type { FlowTemplate } from "@/lib/flows/types"
import { cn } from "@/lib/utils"

import { FlowMiniMap } from "./flow-mini-map"

// Os modelos da semente, para escolher vendo o desenho. O nome e a descrição vêm da API, e o gatilho é dito em
// linguagem de gente. `selected` vazio é a versão de vitrine, em que clicar já escolhe.

export function TemplateGallery({
  selected,
  onSelect,
  onConfirm,
  limit,
  className,
}: {
  selected?: string | null
  onSelect: (template: FlowTemplate) => void
  onConfirm?: (template: FlowTemplate) => void
  limit?: number
  className?: string
}) {
  const { t } = useTranslation()
  const { templates, isLoading, error, reload } = useFlowTemplates()
  const [category, setCategory] = useState<string | null>(null)

  const categories = useMemo(() => Array.from(new Set(templates.map((template) => template.category))), [templates])
  const shown = useMemo(() => {
    const filtered = category ? templates.filter((template) => template.category === category) : templates
    return limit ? filtered.slice(0, limit) : filtered
  }, [category, limit, templates])

  if (error) return <ErrorState error={error} onRetry={() => void reload()} />
  if (isLoading) return <CardGridSkeleton cards={limit ?? 6} media />

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {!limit && categories.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("flows.templates.categoriesLabel")}>
          <CategoryChip label={t("flows.templates.all")} active={!category} onClick={() => setCategory(null)} />
          {categories.map((value) => (
            <CategoryChip
              key={value}
              label={t(`flows.templates.categories.${value}`, { defaultValue: value })}
              active={category === value}
              onClick={() => setCategory(value)}
            />
          ))}
        </div>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((template) => {
          const isSelected = selected === template.slug
          return (
            <li key={template.slug}>
              <button
                type="button"
                aria-pressed={selected === undefined ? undefined : isSelected}
                onClick={() => onSelect(template)}
                onDoubleClick={() => onConfirm?.(template)}
                className={cn(
                  "group flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  isSelected ? "border-primary ring-3 ring-primary/15" : "hover:border-foreground/25"
                )}
              >
                <span className="relative block h-32 border-b bg-muted/40 p-2">
                  <FlowMiniMap definition={template.definition} />
                  {isSelected ? (
                    <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-1 flex-col gap-1 p-3">
                  <span className="text-sm font-semibold tracking-tight">{template.name}</span>
                  <span className="line-clamp-3 text-xs text-pretty text-muted-foreground">{template.description}</span>
                  <span className="mt-auto pt-1.5 text-xs font-medium text-foreground/70">
                    {t(`flows.triggers.${template.triggerType}`)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:h-10",
        active ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}
