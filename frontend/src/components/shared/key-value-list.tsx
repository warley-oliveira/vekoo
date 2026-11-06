import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { CopyButton } from "./copy-button"

export type KeyValueItem = {
  label: ReactNode
  /** Vazio mostra o traço, para a linha não sumir nem deixar buraco. */
  value?: ReactNode
  /** Mostra o botão de copiar ao lado do valor. */
  copyValue?: string
}

export type KeyValueListProps = {
  items: KeyValueItem[]
  /** `inline`: rótulo à esquerda (painéis). `stacked`: rótulo em cima (espaço estreito). */
  layout?: "inline" | "stacked"
  className?: string
}

/** Detalhes de um registro: painel de contato, dados de integração, resumo. */
export function KeyValueList({ items, layout = "inline", className }: KeyValueListProps) {
  const { t } = useTranslation()

  return (
    <dl className={cn("flex flex-col gap-3 text-sm", className)}>
      {items.map((item, index) => {
        const empty = item.value === undefined || item.value === null || item.value === ""

        return (
          <div
            key={index}
            className={cn(
              "min-w-0",
              layout === "inline"
                ? "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-3"
                : "flex flex-col gap-0.5"
            )}
          >
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="flex min-w-0 items-center gap-1 wrap-anywhere">
              <span className={cn("min-w-0", empty && "text-muted-foreground")}>
                {empty ? t("kit.noValue") : item.value}
              </span>
              {item.copyValue ? (
                <CopyButton value={item.copyValue} size="icon-xs" className="-my-1 shrink-0" />
              ) : null}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
