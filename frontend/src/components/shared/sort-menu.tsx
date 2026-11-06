import { useTranslation } from "react-i18next"
import { ArrowDownUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type SortOption<T extends string = string> = {
  value: T
  /** Já com o sentido: "Mais recentes", "Nome de A a Z". */
  label: string
}

export type SortMenuProps<T extends string = string> = {
  options: SortOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/** Ordem de uma coleção que não é tabela. Em tabela, a ordem está no cabeçalho. */
export function SortMenu<T extends string = string>({
  options,
  value,
  onChange,
  className,
}: SortMenuProps<T>) {
  const { t } = useTranslation()
  const current = options.find((option) => option.value === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label={t("kit.sort.current", { label: current?.label ?? "" })}
            className={cn("text-muted-foreground pointer-coarse:h-10", className)}
          />
        }
      >
        <ArrowDownUp />
        <span className="max-w-40 truncate">{current?.label ?? t("kit.sort.title")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("kit.sort.title")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => onChange(next as T)}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
