import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
} from "react"
import type { Editor, Range } from "@tiptap/core"
import type { SuggestionKeyDownProps } from "@tiptap/suggestion"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

export const MENU_WIDTH_PX = 256
export const MENU_MAX_HEIGHT_PX = 288

export type SlashCommand = {
  id: string
  icon: ComponentType<{ className?: string }>
  run: (editor: Editor, range: Range) => void
}

export type SlashDescribe = (id: string) => { label: string; hint: string }

export type SlashMenuHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean }

export type SlashMenuProps = {
  items: SlashCommand[]
  describe: SlashDescribe
  onPick: (item: SlashCommand) => void
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(
  { items, describe, onPick },
  ref
) {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => setActive(0), [items])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })
  }, [active])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowDown") {
        setActive((current) => (current + 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === "ArrowUp") {
        setActive((current) => (current - 1 + items.length) % Math.max(items.length, 1))
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[active]
        if (item) onPick(item)
        return Boolean(item)
      }
      return false
    },
  }))

  if (items.length === 0) return null

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={t("pipelines.description.slash.label")}
      style={{ maxHeight: MENU_MAX_HEIGHT_PX, width: MENU_WIDTH_PX }}
      className="flex flex-col gap-0.5 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      {items.map((item, index) => {
        const { label, hint } = describe(item.id)
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === active}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none pointer-coarse:min-h-10",
              index === active && "bg-accent text-accent-foreground"
            )}
            // Sem isto, tocar na lista tira o cursor do texto e o comando não sabe onde agir.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => onPick(item)}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-sm">{label}</span>
              <span className="block truncate text-xs text-muted-foreground">{hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
})
