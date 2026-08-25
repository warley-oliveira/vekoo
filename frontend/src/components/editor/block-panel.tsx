import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react"

import { useAi } from "@/components/editor/ai-store"
import { BLOCK_TYPES } from "@/components/editor/block-types"
import { useEditor } from "@/components/editor/editor-store"
import { ImageFrame } from "@/components/editor/image-frame"
import { ImagePicker } from "@/components/editor/image-picker"
import {
  PanelHeader,
  Section,
  Stepper,
  Swatch,
} from "@/components/editor/panel-controls"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  CENTER_FRAME,
  duplicateBlock,
  type BadgeBlock,
  type Block,
  type BlockAlign,
  type BlockSpacing,
  type BlockWidth,
  type ButtonBlock,
  type CarouselTheme,
  type DividerBlock,
  type ImageBlock,
  type InkColor,
  type ListBlock,
  type StatBlock,
  type TableBlock,
  type TextBlock,
  type TextRole,
} from "@/lib/doc"
import type { RewriteIntent } from "@/lib/ai"
import { newId } from "@/lib/store"

// Painel do bloco selecionado. Só ajustes de forma: o conteúdo se edita no
// card, no lugar.

export function BlockPanel({
  block,
  index,
  theme,
  onClose,
}: {
  block: Block
  index: number
  theme: CarouselTheme
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()

  const Icon = BLOCK_TYPES.find((b) => b.type === block.type)?.icon
  const update = (next: Block) => dispatch({ type: "block/update", block: next })

  return (
    <div className="flex h-full w-60 flex-col">
      <PanelHeader
        icon={Icon && <Icon className="size-4 text-muted-foreground" />}
        title={t(`editor.blocks.${block.type}`)}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {block.type === "text" && (
          <TextControls block={block} theme={theme} update={update} />
        )}
        {block.type === "list" && (
          <ListControls block={block} theme={theme} update={update} />
        )}
        {(block.type === "steps" || block.type === "quote" ||
          block.type === "testimonial") && (
          <Section label={t("editor.properties.color")}>
            <ColorControl
              value={block.color}
              onChange={(color) => update({ ...block, color })}
              theme={theme}
            />
          </Section>
        )}
        {block.type === "stat" && (
          <StatControls block={block} theme={theme} update={update} />
        )}
        {block.type === "divider" && (
          <DividerControls block={block} update={update} />
        )}
        {block.type === "table" && <TableControls block={block} update={update} />}
        {block.type === "button" && <ButtonControls block={block} update={update} />}
        {block.type === "badge" && <BadgeControls block={block} update={update} />}
        {block.type === "image" && (
          <ImageControls block={block} theme={theme} update={update} />
        )}

        {(block.type === "text" || block.type === "quote") && (
          <RewriteControls block={block} />
        )}

        <LayoutControls block={block} update={update} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t p-3">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("editor.properties.moveUp")}
          onClick={() => dispatch({ type: "block/move", id: block.id, direction: -1 })}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("editor.properties.moveDown")}
          onClick={() => dispatch({ type: "block/move", id: block.id, direction: 1 })}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("common.duplicate")}
          onClick={() =>
            dispatch({
              type: "block/insert",
              index: index + 1,
              block: duplicateBlock(block, () => newId("block")),
            })
          }
        >
          <Copy />
        </Button>
        <Button
          variant="destructive"
          size="icon-sm"
          className="ml-auto"
          aria-label={t("editor.properties.delete")}
          onClick={() => dispatch({ type: "block/remove", id: block.id })}
        >
          <Trash2 />
        </Button>
      </div>
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
        <Swatch
          key={option}
          color={option === "accent" ? theme.accent : theme.ink}
          muted={option === "muted"}
          label={t(`editor.properties.colors.${option}`)}
          selected={value === option}
          onClick={() => onChange(option)}
        />
      ))}
    </div>
  )
}

/** Select curto reaproveitado por quase todos os controles do painel. */
function OptionSelect<T extends string>({
  value,
  options,
  labelFor,
  onChange,
}: {
  value: T
  options: readonly T[]
  labelFor: (option: T) => string
  onChange: (value: T) => void
}) {
  return (
    <Select
      value={value}
      items={Object.fromEntries(options.map((o) => [o, labelFor(o)]))}
      onValueChange={(v) => onChange(v as T)}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labelFor(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const TEXT_ROLES: readonly TextRole[] = ["title", "subtitle", "body", "caption"]

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

  return (
    <>
      <Section label={t("editor.properties.role")}>
        <OptionSelect
          value={block.role}
          options={TEXT_ROLES}
          labelFor={(role) => t(`editor.properties.roles.${role}`)}
          onChange={(role) => update({ ...block, role })}
        />
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

const LIST_STYLES: ReadonlyArray<ListBlock["style"]> = ["bullet", "number", "check"]

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

  return (
    <>
      <Section label={t("editor.properties.listStyle")}>
        <OptionSelect
          value={block.style}
          options={LIST_STYLES}
          labelFor={(style) => t(`editor.properties.listStyles.${style}`)}
          onChange={(style) => update({ ...block, style })}
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

const BADGE_VARIANTS: ReadonlyArray<BadgeBlock["variant"]> = ["soft", "solid"]

function BadgeControls({
  block,
  update,
}: {
  block: BadgeBlock
  update: (block: Block) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <Section label={t("editor.properties.badgeVariant")}>
        <OptionSelect
          value={block.variant}
          options={BADGE_VARIANTS}
          labelFor={(variant) => t(`editor.properties.badgeVariants.${variant}`)}
          onChange={(variant) => update({ ...block, variant })}
        />
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

function ImageControls({
  block,
  theme,
  update,
}: {
  block: ImageBlock
  theme: CarouselTheme
  update: (block: Block) => void
}) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)

  return (
    <>
      <Section label={t("editor.cardPanel.imageSource")}>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => setPicking(true)}
        >
          <ImageIcon />
          {t(`editor.cardPanel.imageSources.${block.image.source.kind}`)}
        </Button>
      </Section>
      <ImageFrame
        image={block.image}
        theme={theme}
        onChange={(image) => update({ ...block, image })}
      />
      <ImagePicker
        open={picking}
        onOpenChange={setPicking}
        theme={theme}
        source={block.image.source}
        onPick={(source) =>
          update({ ...block, image: { ...block.image, source, ...CENTER_FRAME } })
        }
      />
    </>
  )
}

const REWRITE_INTENTS: readonly RewriteIntent[] = [
  "shorten",
  "expand",
  "casual",
  "expert",
  "fix",
]

/** Reescrita do trecho — o único lugar do painel que gasta crédito. */
function RewriteControls({ block }: { block: Block }) {
  const { t } = useTranslation()
  const { rewrite, busy, task } = useAi()
  const running = task?.kind === "rewrite" && task.blockId === block.id

  return (
    <Section label={t("editor.ai.rewriteLabel")}>
      <div className="flex flex-wrap gap-1.5">
        {REWRITE_INTENTS.map((intent) => (
          <Button
            key={intent}
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => void rewrite(block, intent)}
          >
            {running ? (
              <Loader2 className="animate-spin" />
            ) : (
              intent === REWRITE_INTENTS[0] && <Sparkles />
            )}
            {t(`editor.ai.intents.${intent}`)}
          </Button>
        ))}
      </div>
    </Section>
  )
}

const SPACINGS: readonly BlockSpacing[] = ["tight", "normal", "loose"]
const WIDTHS: readonly BlockWidth[] = ["full", "narrow"]

/** Espaço e largura valem para qualquer bloco — ficam no fim, sempre. */
function LayoutControls({
  block,
  update,
}: {
  block: Block
  update: (block: Block) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <Section label={t("editor.properties.spacing")}>
        <OptionSelect
          value={block.spacing ?? "normal"}
          options={SPACINGS}
          labelFor={(spacing) => t(`editor.properties.spacings.${spacing}`)}
          onChange={(spacing) =>
            update({ ...block, spacing: spacing === "normal" ? undefined : spacing })
          }
        />
      </Section>
      <Section label={t("editor.properties.width")}>
        <OptionSelect
          value={block.width ?? "full"}
          options={WIDTHS}
          labelFor={(width) => t(`editor.properties.widths.${width}`)}
          onChange={(width) =>
            update({ ...block, width: width === "full" ? undefined : width })
          }
        />
      </Section>
    </>
  )
}

const DIVIDER_STYLES: ReadonlyArray<DividerBlock["style"]> = [
  "line",
  "dots",
  "accent",
]

function DividerControls({
  block,
  update,
}: {
  block: DividerBlock
  update: (block: Block) => void
}) {
  const { t } = useTranslation()

  return (
    <Section label={t("editor.properties.dividerStyle")}>
      <OptionSelect
        value={block.style}
        options={DIVIDER_STYLES}
        labelFor={(style) => t(`editor.properties.dividerStyles.${style}`)}
        onChange={(style) => update({ ...block, style })}
      />
    </Section>
  )
}

const BUTTON_VARIANTS: ReadonlyArray<ButtonBlock["variant"]> = ["solid", "outline"]

function ButtonControls({
  block,
  update,
}: {
  block: ButtonBlock
  update: (block: Block) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <Section label={t("editor.properties.buttonVariant")}>
        <OptionSelect
          value={block.variant}
          options={BUTTON_VARIANTS}
          labelFor={(variant) => t(`editor.properties.buttonVariants.${variant}`)}
          onChange={(variant) => update({ ...block, variant })}
        />
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
            update({ ...block, rows: [...block.rows, Array<string>(columns).fill("")] })
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
