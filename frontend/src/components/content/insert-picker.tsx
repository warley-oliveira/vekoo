import { useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { ResponsivePopover, SearchInput } from "@/components/shared"
import { matchesSearch } from "@/lib/search-text"

export type PickerItem = {
  id: string
  label: string
  description?: string
  leading?: ReactNode
  onSelect: () => void
}

export type PickerGroup = { id: string; label: string; items: PickerItem[] }

/** A partir daqui a lista ganha busca: acima disso, ninguém acha rolando. */
const SEARCH_THRESHOLD = 7

type InsertPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  trigger: ReactElement
  groups: PickerGroup[]
  searchPlaceholder: string
  emptyLabel: string
  /** Embaixo da lista, sempre à vista: "Enviar arquivo novo". */
  footer?: ReactNode
}

/**
 * Escolher o que inserir no texto: popover no desktop, folha no celular. As setas andam pela
 * lista, porque quem chegou aqui pelo teclado não deveria precisar voltar ao mouse.
 */
export function InsertPicker({
  open,
  onOpenChange,
  title,
  trigger,
  groups,
  searchPlaceholder,
  emptyLabel,
  footer,
}: InsertPickerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  const total = groups.reduce((sum, group) => sum + group.items.length, 0)
  const visible = useMemo(() => {
    if (!query) return groups
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          matchesSearch(`${item.label} ${item.description ?? ""}`, query)
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [groups, query])

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const buttons = Array.from(listRef.current?.querySelectorAll("button") ?? [])
    if (buttons.length === 0) return

    event.preventDefault()
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === "ArrowDown" ? 1 : -1
    const next = current === -1 ? 0 : (current + step + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery("")
      }}
      title={title}
      trigger={trigger}
      align="start"
      className="w-80 gap-2"
    >
      <div onKeyDown={moveFocus} className="flex min-h-0 flex-col gap-2">
        {total > SEARCH_THRESHOLD ? (
          <SearchInput
            value={query}
            onChange={setQuery}
            debounce={0}
            shortcut={false}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        ) : null}

        <div ref={listRef} className="flex max-h-72 min-h-0 flex-col gap-2 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-pretty text-muted-foreground">
              {query ? t("content.picker.noMatch") : emptyLabel}
            </p>
          ) : (
            visible.map((group) => (
              <div key={group.id} role="group" aria-label={group.label}>
                <p className="px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          item.onSelect()
                          onOpenChange(false)
                          setQuery("")
                        }}
                        className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
                      >
                        {item.leading}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{item.label}</span>
                          {item.description ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {footer}
      </div>
    </ResponsivePopover>
  )
}
