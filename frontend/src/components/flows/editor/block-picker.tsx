import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { Search, X } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { BLOCK_CATALOG, BLOCK_GROUPS, blockFamily, blockIcon, isTrigger, POPULAR_BLOCKS, type BlockGroup } from "@/lib/flows/catalog"
import { useMotionPreset } from "@/lib/motion"
import { normalizeSearchText } from "@/lib/search-text"
import { cn } from "@/lib/utils"

import { useEditor, useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"

// O seletor de blocos, com tudo agrupado pelo que a pessoa quer fazer. Abre do "+" de uma saída, ao
// soltar a linha no vazio e pelo botão da barra (ou Ctrl+K). Dá para arrastar um item para o quadro. No
// celular ocupa quase a tela toda, e o teclado só sobe se a pessoa tocar na busca: ele cobriria a lista.

export const BLOCK_DRAG_TYPE = "application/x-vekoo-block"

const PICKER_WIDTH = 360
const PICKER_MAX_HEIGHT = 520
const MARGIN = 16

type Row = { type: string; group: BlockGroup | "popular" }

export function BlockPicker() {
  const picker = useEditor((state) => state.picker)
  return <AnimatePresence>{picker ? <PickerPanel key="picker" /> : null}</AnimatePresence>
}

function GroupChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-6 shrink-0 rounded-full border px-2 text-xs whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:h-9 pointer-coarse:px-3",
        active ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}

function PickerPanel() {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const api = useEditorApi()
  const isMobile = useIsMobile()
  const picker = useEditor((state) => state.picker)
  const hasTrigger = useEditor(useShallow((state) => state.nodes.some((node) => isTrigger(node.type))))
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [group, setGroup] = useState<BlockGroup | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const close = () => api.getState().closePicker()

  const index = useMemo(
    () =>
      BLOCK_CATALOG.map((entry) => ({
        ...entry,
        label: t(`flows.blocks.${entry.type}.label`),
        description: t(`flows.blocks.${entry.type}.description`),
        haystack: normalizeSearchText(
          [
            t(`flows.blocks.${entry.type}.label`),
            t(`flows.blocks.${entry.type}.description`),
            t(`flows.blocks.${entry.type}.keywords`),
            t(`flows.groups.${entry.group}.title`),
            entry.type,
          ].join(" ")
        ),
      })),
    [t]
  )

  // Gatilho só começa fluxo: não entra ao continuar uma linha, nem quando o fluxo já tem o dele.
  const allowed = useMemo(
    () => index.filter((entry) => entry.group !== "start" || (!picker?.source && !hasTrigger)),
    [hasTrigger, index, picker?.source]
  )

  const needle = normalizeSearchText(query)
  const groups = useMemo(
    () => BLOCK_GROUPS.filter((value) => allowed.some((entry) => entry.group === value)),
    [allowed]
  )

  const rows = useMemo<Row[]>(() => {
    const scoped = group ? allowed.filter((entry) => entry.group === group) : allowed
    if (needle) {
      const words = needle.split(/\s+/)
      return scoped
        .filter((entry) => words.every((word) => entry.haystack.includes(word)))
        .map((entry) => ({ type: entry.type, group: entry.group }))
    }
    const ordered = groups
      .filter((value) => !group || value === group)
      .flatMap((value) => scoped.filter((entry) => entry.group === value).map((entry) => ({ type: entry.type, group: value })))
    const popular = !group && (hasTrigger || picker?.source)
      ? POPULAR_BLOCKS.map((type): Row => ({ type, group: "popular" }))
      : []
    return [...popular, ...ordered]
  }, [allowed, group, groups, hasTrigger, needle, picker?.source])

  useEffect(() => setActive(0), [needle, group])

  // Clique fora fecha. No próximo ciclo, para o clique que abriu não fechar na mesma hora.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as globalThis.Node)) api.getState().closePicker()
    }
    const timer = window.setTimeout(() => document.addEventListener("pointerdown", onPointerDown), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [api])

  // Sem o foco na busca, ele fica no painel: quem usa leitor de tela precisa saber que abriu.
  useEffect(() => {
    if (isMobile) panelRef.current?.focus()
  }, [isMobile])

  useLayoutEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    element?.scrollIntoView({ block: "nearest" })
  }, [active])

  const pick = (type: string) => {
    const state = api.getState()
    // Sem saída de origem nem lugar marcado: nasce no meio do que está na tela.
    const center = useEditorUi.getState().canvasCenter?.()
    state.addBlock(type, {
      source: state.picker?.source,
      position: state.picker?.flow ?? (state.picker?.source ? undefined : center),
    })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      close()
      return
    }
    if (rows.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((current) => (current + 1) % rows.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((current) => (current - 1 + rows.length) % rows.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      pick(rows[active].type)
    }
  }

  const position = useMemo(() => {
    const screen = picker?.screen
    if (!screen) {
      return { left: `calc(50% - ${PICKER_WIDTH / 2}px)`, bottom: 80 }
    }
    const left = Math.min(screen.x, window.innerWidth - PICKER_WIDTH - MARGIN)
    const top = Math.min(screen.y, window.innerHeight - Math.min(PICKER_MAX_HEIGHT, window.innerHeight - 2 * MARGIN) - MARGIN)
    return { left: Math.max(MARGIN, left), top: Math.max(MARGIN, top) }
  }, [picker?.screen])

  const activeRow = rows[active]
  let lastGroup: string | null = null

  return (
    <motion.div
      ref={panelRef}
      {...preset.slideUp}
      role="dialog"
      tabIndex={-1}
      aria-label={t("flows.picker.title")}
      onKeyDown={onKeyDown}
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden rounded-2xl border bg-popover shadow-xl outline-none",
        isMobile && "inset-x-2 top-2 bottom-[calc(var(--app-bottom-nav-total,0px)+0.5rem)]"
      )}
      style={
        isMobile
          ? undefined
          : { ...position, width: PICKER_WIDTH, maxWidth: "calc(100vw - 32px)", maxHeight: `min(${PICKER_MAX_HEIGHT}px, calc(100dvh - 32px))` }
      }
    >
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={!isMobile}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={picker?.source ? t("flows.picker.placeholderNext") : t("flows.picker.placeholder")}
          aria-label={t("flows.picker.title")}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={activeRow ? `${listId}-${active}` : undefined}
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        {isMobile ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("flows.picker.close")} onClick={close}>
            <X />
          </Button>
        ) : query ? (
          <button
            type="button"
            aria-label={t("flows.picker.clear")}
            onClick={() => setQuery("")}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {groups.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5 [scrollbar-width:none]" role="group" aria-label={t("flows.picker.groupsLabel")}>
          <GroupChip label={t("flows.picker.allGroups")} active={!group} onClick={() => setGroup(null)} />
          {groups.map((value) => (
            <GroupChip
              key={value}
              label={t(`flows.groups.${value}.title`)}
              active={group === value}
              onClick={() => setGroup(group === value ? null : value)}
            />
          ))}
        </div>
      ) : null}

      <div ref={listRef} id={listId} role="listbox" aria-label={t("flows.picker.title")} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">{t("flows.picker.emptyTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("flows.picker.emptyHint")}</p>
          </div>
        ) : (
          rows.map((row, rowIndex) => {
            const entry = allowed.find((item) => item.type === row.type) ?? index.find((item) => item.type === row.type)
            if (!entry) return null
            const Icon = blockIcon(entry.type)
            const showHeading = !needle && row.group !== lastGroup
            lastGroup = row.group
            return (
              <div key={`${row.group}-${row.type}`}>
                {showHeading ? (
                  <p className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground first:pt-1">
                    {t(`flows.groups.${row.group}.title`)}
                  </p>
                ) : null}
                <div
                  id={`${listId}-${rowIndex}`}
                  data-index={rowIndex}
                  role="option"
                  aria-selected={rowIndex === active}
                  draggable={!picker?.source}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(BLOCK_DRAG_TYPE, entry.type)
                    event.dataTransfer.effectAllowed = "move"
                  }}
                  onMouseMove={() => {
                    if (rowIndex !== active) setActive(rowIndex)
                  }}
                  onClick={() => pick(entry.type)}
                  className={cn(
                    "flow-block flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 pointer-coarse:py-2.5",
                    rowIndex === active && "bg-muted"
                  )}
                  data-family={blockFamily(entry.type)}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--block-tint-soft) text-(--block-tint)">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{entry.description}</span>
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <p className="hidden border-t px-3 py-2 text-xs text-muted-foreground sm:block">
        {picker?.source ? t("flows.picker.footerConnect") : t("flows.picker.footerDrag")}
      </p>
    </motion.div>
  )
}
