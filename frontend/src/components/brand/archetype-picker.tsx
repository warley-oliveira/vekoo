import { useTranslation } from "react-i18next"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { nextArchetypes, type BrandArchetypes } from "@/lib/brand-core"
import { ARCHETYPES, type Archetype } from "@/lib/taxonomy"
import { cn } from "@/lib/utils"

type Props = {
  value: BrandArchetypes
  onChange: (value: BrandArchetypes) => void
  labelId: string
  hintId: string
}

/** O estilo da marca: até dois arquétipos, o primeiro é o principal. */
export function ArchetypePicker({ value, onChange, labelId, hintId }: Props) {
  const { t } = useTranslation()
  const order = [value.primary, value.secondary]

  return (
    <ToggleGroup
      multiple
      value={order.filter(Boolean)}
      onValueChange={(pressed) => onChange(nextArchetypes(value, pressed as Archetype[]))}
      variant="outline"
      className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2"
      aria-labelledby={labelId}
      aria-describedby={hintId}
    >
      {ARCHETYPES.map((code) => {
        const position = order.indexOf(code)
        return (
          <ToggleGroupItem
            key={code}
            value={code}
            className={cn(
              "h-auto min-h-14 w-full flex-col items-start justify-start gap-0.5 px-3 py-2.5 text-left whitespace-normal",
              "aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:hover:bg-primary/10"
            )}
          >
            <span className="flex w-full items-baseline justify-between gap-2">
              <span className="font-medium">{t(`taxonomy.archetypes.${code}.label`)}</span>
              {position >= 0 && (
                <span className="font-mono text-[0.7rem] text-primary uppercase">
                  {t(position === 0 ? "brand.identity.archetypePrimary" : "brand.identity.archetypeSecondary")}
                </span>
              )}
            </span>
            <span className="text-xs font-normal text-muted-foreground">{t(`taxonomy.archetypes.${code}.hint`)}</span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
