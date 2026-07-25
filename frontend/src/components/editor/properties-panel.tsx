import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Minus,
  Plus,
  Trash2,
  X,
} from "lucide-react"

import { BLOCK_TYPES } from "@/components/editor/block-types"
import { activeCard, useEditor } from "@/components/editor/editor-store"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type {
  Block,
  BlockAlign,
  ButtonBlock,
  CarouselTheme,
  DividerBlock,
  InkColor,
  ListBlock,
  QuoteBlock,
  StatBlock,
  TableBlock,
  TextBlock,
  TextRole,
} from "@/lib/doc"
import { cn } from "@/lib/utils"

// Painel do bloco selecionado. Sempre montado: a largura anima por CSS (o
// idioma da sidebar do app) e o card no canvas se reencaixa sozinho, porque
// o encaixe é uma container query.

export function PropertiesPanel() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()

  const card = activeCard(state)
  const block = card?.blocks.find((b) => b.id === state.selection.blockId)
  const open = Boolean(block)

  return (
    <aside
      aria-label={t("editor.properties.label")}
      aria-hidden={!open}
      className={cn(
        "hidden shrink-0 overflow-hidden bg-background transition-[width] duration-200 lg:block",
        open ? "w-60 border-l" : "w-0"
      )}
    >
      {block && (
        <PanelContent
          block={block}
          theme={state.doc.theme}
          onClose={() => dispatch({ type: "block/select", id: null })}
        />
      )}
    </aside>
  )
}

function PanelContent({
  block,
  theme,
  onClose,
}: {
  block: Block
  theme: CarouselTheme
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()

  const Icon = BLOCK_TYPES.find((b) => b.type === block.type)?.icon
  const update = (next: Block) => dispatch({ type: "block/update", block: next })

  return (
    <div className="flex h-full w-60 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        <span className="text-sm font-medium">
          {t(`editor.blocks.${block.type}`)}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label={t("editor.properties.closeAria")}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {block.type === "text" && (
          <TextControls block={block} theme={theme} update={update} />
        )}
        {block.type === "list" && (
          <ListControls block={block} theme={theme} update={update} />
        )}
        {block.type === "stat" && (
          <StatControls block={block} theme={theme} update={update} />
        )}
        {block.type === "quote" && (
          <QuoteControls block={block} theme={theme} update={update} />
        )}
        {block.type === "divider" && (
          <DividerControls block={block} update={update} />
        )}
        {block.type === "table" && (
          <TableControls block={block} update={update} />
        )}
        {block.type === "button" && (
          <ButtonControls block={block} update={update} />
        )}
        {block.type === "image" && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("editor.properties.imageHint")}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t p-3">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("editor.properties.moveUp")}
          onClick={() =>
            dispatch({ type: "block/move", id: block.id, direction: -1 })
          }
        >
          <ArrowUp />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("editor.properties.moveDown")}
          onClick={() =>
            dispatch({ type: "block/move", id: block.id, direction: 1 })
          }
        >
          <ArrowDown />
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="ml-auto"
          onClick={() => dispatch({ type: "block/remove", id: block.id })}
        >
          <Trash2 /> {t("editor.properties.delete")}
        </Button>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function AlignControl({
  value,
  onChange,
}: {
  value: BlockAlign
  onChange: (align: BlockAlign) => void
}) {
  const { t } = useTranslation()

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(groupValue) => {
        const next = groupValue[0] as BlockAlign | undefined
        if (next) onChange(next)
      }}
    >
      <ToggleGroupItem
        value="start"
        aria-label={t("editor.properties.alignOptions.start")}
      >
        <AlignLeft />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="center"
        aria-label={t("editor.properties.alignOptions.center")}
      >
        <AlignCenter />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="end"
        aria-label={t("editor.properties.alignOptions.end")}
      >
        <AlignRight />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

const INK_OPTIONS: readonly InkColor[] = ["ink", "accent", "muted"]

function ColorControl({
  value,
  onChange,
  theme,
}: {
  value: InkColor
  onChange: (color: InkColor) => void
  theme: CarouselTheme
}) {
  const { t } = useTranslation()

  return (
    <div className="flex gap-1.5">
      {INK_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-label={t(`editor.properties.colors.${option}`)}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "flex size-7 items-center justify-center rounded-full border bg-background outline-none",
            "focus-visible:ring-3 focus-visible:ring-ring/50",
            value === option &&
              "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
        >
          <span
            className="size-4.5 rounded-full"
            style={{
              backgroundColor: option === "accent" ? theme.accent : theme.ink,
              opacity: option === "muted" ? 0.45 : 1,
            }}
          />
        </button>
      ))}
    </div>
  )
}

function TextControls({
  block,
  theme,
  update,
}: {
  block: TextBlock
  theme: CarouselTheme
  update: (block: Block) => void
}) {
  const { t } = useTranslation()
  const roles: readonly TextRole[] = ["title", "subtitle", "body", "caption"]

  return (
    <>
      <Section label={t("editor.properties.role")}>
        <Select
          value={block.role}
          items={Object.fromEntries(
            roles.map((role) => [role, t(`editor.properties.roles.${role}`)])
          )}
          onValueChange={(v) => update({ ...block, role: v as TextRole })}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role} value={role}>
                {t(`editor.properties.roles.${role}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>
      <Section label={t("editor.properties.align")}>
        <AlignControl
          value={block.align}
          onChange={(align) => update({ ...block, align })}
        />
      </Section>
      <Section label={t("editor.properties.color")}>
        <ColorControl
          value={block.color}
          onChange={(color) => update({ ...block, color })}
          theme={theme}
        />
      </Section>
    </>
  )
}

function ListControls({
  block,
  theme,
  update,
}: {
  block: ListBlock
  theme: CarouselTheme
  update: (block: Block) => void
}) {
  const { t } = useTranslation()
  const styles: ReadonlyArray<ListBlock["style"]> = [
    "bullet",
    "number",
    "check",
  ]

  return (
    <>
      <Section label={t("editor.properties.listStyle")}>
        <Select
          value={block.style}
          items={Object.fromEntries(
            styles.map((s) => [s, t(`editor.properties.listStyles.${s}`)])
          )}
          onValueChange={(v) =>
            update({ ...block, style: v as ListBlock["style"] })
          }
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {styles.map((style) => (
              <SelectItem key={style} value={style}>
                {t(`editor.properties.listStyles.${style}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>
      <Section label={t("editor.properties.color")}>
        <ColorControl
          value={block.color}
          onChange={(color) => update({ ...block, color })}
          theme={theme}
        />
      </Section>
    </>
  )
}

function StatControls({
  block,
  theme,
  update,
}: {
  block: StatBlock
  theme: CarouselTheme
  update: (block: Block) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <Section label={t("editor.properties.align")}>
        <AlignControl
          value={block.align}
          onChange={(align) => update({ ...block, align })}
        />
      </Section>
      <Section label={t("editor.properties.color")}>
        <ColorControl
          value={block.color}
          onChange={(color) => update({ ...block, color })}
          theme={theme}
        />
      </Section>
    </>
  )
}

function QuoteControls({
  block,
  theme,
  update,
}: {
  block: QuoteBlock
  theme: CarouselTheme
  update: (block: Block) => void
}) {
  const { t } = useTranslation()

  return (
    <Section label={t("editor.properties.color")}>
      <ColorControl
        value={block.color}
        onChange={(color) => update({ ...block, color })}
        theme={theme}
      />
    </Section>
  )
}

function DividerControls({
  block,
  update,
}: {
  block: DividerBlock
  update: (block: Block) => void
}) {
  const { t } = useTranslation()
  const styles: ReadonlyArray<DividerBlock["style"]> = [
    "line",
    "dots",
    "accent",
  ]

  return (
    <Section label={t("editor.properties.dividerStyle")}>
      <Select
        value={block.style}
        items={Object.fromEntries(
          styles.map((s) => [s, t(`editor.properties.dividerStyles.${s}`)])
        )}
        onValueChange={(v) =>
          update({ ...block, style: v as DividerBlock["style"] })
        }
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {styles.map((style) => (
            <SelectItem key={style} value={style}>
              {t(`editor.properties.dividerStyles.${style}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Section>
  )
}

function ButtonControls({
  block,
  update,
}: {
  block: ButtonBlock
  update: (block: Block) => void
}) {
  const { t } = useTranslation()
  const variants: ReadonlyArray<ButtonBlock["variant"]> = ["solid", "outline"]

  return (
    <>
      <Section label={t("editor.properties.buttonVariant")}>
        <Select
          value={block.variant}
          items={Object.fromEntries(
            variants.map((v) => [v, t(`editor.properties.buttonVariants.${v}`)])
          )}
          onValueChange={(v) =>
            update({ ...block, variant: v as ButtonBlock["variant"] })
          }
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {variants.map((variant) => (
              <SelectItem key={variant} value={variant}>
                {t(`editor.properties.buttonVariants.${variant}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>
      <Section label={t("editor.properties.align")}>
        <AlignControl
          value={block.align}
          onChange={(align) => update({ ...block, align })}
        />
      </Section>
    </>
  )
}

function TableControls({
  block,
  update,
}: {
  block: TableBlock
  update: (block: Block) => void
}) {
  const { t } = useTranslation()
  const columns = block.rows[0]?.length ?? 0
  const bodyRows = Math.max(0, block.rows.length - 1)

  return (
    <>
      <Section label={t("editor.properties.tableRows")}>
        <Stepper
          count={bodyRows}
          decrementAria={t("editor.properties.removeRow")}
          incrementAria={t("editor.properties.addRow")}
          canDecrement={bodyRows > 1}
          onDecrement={() => update({ ...block, rows: block.rows.slice(0, -1) })}
          onIncrement={() =>
            update({
              ...block,
              rows: [...block.rows, Array<string>(columns).fill("")],
            })
          }
        />
      </Section>
      <Section label={t("editor.properties.tableColumns")}>
        <Stepper
          count={columns}
          decrementAria={t("editor.properties.removeColumn")}
          incrementAria={t("editor.properties.addColumn")}
          canDecrement={columns > 1}
          onDecrement={() =>
            update({ ...block, rows: block.rows.map((row) => row.slice(0, -1)) })
          }
          onIncrement={() =>
            update({ ...block, rows: block.rows.map((row) => [...row, ""]) })
          }
        />
      </Section>
    </>
  )
}

function Stepper({
  count,
  canDecrement,
  onDecrement,
  onIncrement,
  decrementAria,
  incrementAria,
}: {
  count: number
  canDecrement: boolean
  onDecrement: () => void
  onIncrement: () => void
  decrementAria: string
  incrementAria: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={decrementAria}
        disabled={!canDecrement}
        onClick={onDecrement}
      >
        <Minus />
      </Button>
      <span className="w-8 text-center text-sm tabular-nums">{count}</span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={incrementAria}
        onClick={onIncrement}
      >
        <Plus />
      </Button>
    </div>
  )
}
