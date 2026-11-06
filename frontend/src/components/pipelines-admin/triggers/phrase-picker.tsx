import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Check, ChevronDown } from "lucide-react"

import { ResponsivePopover } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { normalizeSearchText } from "@/lib/search-text"
import { cn } from "@/lib/utils"

export type PhraseOption = {
  value: string
  label: string
  description?: string
  icon?: ReactNode
  group?: string
  disabled?: boolean
}

type PhrasePickerProps = {
  /** O que a escolha quer dizer, para leitor de tela e para o título no celular. */
  label: string
  value: string | null | undefined
  options: PhraseOption[]
  onChange: (value: string) => void
  placeholder?: string
  /** Rótulo do botão, quando a frase pede outro texto que não o da opção. */
  display?: ReactNode
  invalid?: boolean
  /** A partir daqui a lista ganha busca. */
  searchFrom?: number
  align?: "start" | "center" | "end"
  className?: string
}

const SEARCH_FROM = 8

/**
 * Um pedaço escolhível da frase de um gatilho: "Quando [um card for criado] em [qualquer etapa]". É um
 * botão que parece texto sublinhado, e não um campo de formulário, porque a pessoa está escrevendo uma
 * frase. Popover no desktop, folha no celular; setas, Enter e digitação funcionam.
 */
export function PhrasePicker({
  label,
  value,
  options,
  onChange,
  placeholder,
  display,
  invalid = false,
  searchFrom = SEARCH_FROM,
  align = "start",
  className,
}: PhrasePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const selected = options.find((option) => option.value === value)

  const groups = useMemo(() => {
    const byGroup = new Map<string, PhraseOption[]>()
    for (const option of options) {
      const key = option.group ?? ""
      byGroup.set(key, [...(byGroup.get(key) ?? []), option])
    }
    return [...byGroup.entries()]
  }, [options])

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={label}
      align={align}
      className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0"
      sheetClassName="px-2"
      trigger={
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${label}: ${selected?.label ?? placeholder ?? ""}`}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-8 max-w-full min-w-0 gap-1 border-dashed bg-transparent px-2 font-medium text-foreground shadow-none hover:bg-accent pointer-coarse:h-10",
            !selected && !display && "text-muted-foreground",
            invalid && "border-destructive text-destructive",
            className
          )}
        >
          {selected?.icon && !display ? <span className="[&>svg]:size-3.5">{selected.icon}</span> : null}
          <span className="min-w-0 truncate">{display ?? selected?.label ?? placeholder}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      }
    >
      <Command
        className="bg-transparent"
        filter={(itemValue, search) =>
          normalizeSearchText(itemValue).includes(normalizeSearchText(search)) ? 1 : 0
        }
      >
        {options.length >= searchFrom ? (
          <CommandInput placeholder={t("pipelinesAdmin.triggers.pickerSearch")} />
        ) : null}
        <CommandList className="max-h-80">
          <CommandEmpty>{t("pipelinesAdmin.triggers.pickerEmpty")}</CommandEmpty>
          {groups.map(([group, items]) => (
            <CommandGroup key={group} heading={group || undefined}>
              {items.map((option) => (
                <CommandItem
                  key={option.value}
                  // O filtro olha o `value`: é por aqui que a busca acha o nome, não o id.
                  value={`${option.label} ${option.description ?? ""} ${option.value}`}
                  disabled={option.disabled}
                  className="items-start gap-2 pointer-coarse:min-h-10"
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.icon ? (
                    <span className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4">{option.icon}</span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug">{option.label}</span>
                    {option.description ? (
                      <span className="block text-xs leading-snug text-muted-foreground">{option.description}</span>
                    ) : null}
                  </span>
                  {option.value === value ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </ResponsivePopover>
  )
}
