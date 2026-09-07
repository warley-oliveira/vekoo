import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Copy,
  Image as ImageIcon,
  Square,
  Trash2,
} from "lucide-react"

import { useCardActions } from "@/components/editor/card-actions"
import { useEditor } from "@/components/editor/editor-store"
import { ImageFrame } from "@/components/editor/image-frame"
import { ImagePicker } from "@/components/editor/image-picker"
import {
  OptionTile,
  PanelHeader,
  Section,
  Swatch,
} from "@/components/editor/panel-controls"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCatalog } from "@/lib/catalog"
import {
  CENTER_FRAME,
  defaultImage,
  type CardLayout,
  type CarouselCard,
  type CarouselTheme,
  type VerticalAlign,
} from "@/lib/doc"
import { cn } from "@/lib/utils"

// O painel do card — aparece quando nenhum bloco está selecionado. É aqui que
// moram as propriedades que até agora só existiam na semente: disposição da
// imagem, fundo, alinhamento vertical e a arte de destaque.

const LAYOUTS: readonly CardLayout[] = [
  "no-image",
  "image-top",
  "image-left",
  "image-right",
  "image-full",
]

const V_ALIGNS: ReadonlyArray<{ value: VerticalAlign; icon: typeof Square }> = [
  { value: "top", icon: AlignVerticalJustifyStart },
  { value: "center", icon: AlignVerticalJustifyCenter },
  { value: "bottom", icon: AlignVerticalJustifyEnd },
]

export function CardPanel({
  card,
  index,
  theme,
}: {
  card: CarouselCard
  index: number
  theme: CarouselTheme
}) {
  const { t } = useTranslation()
  const { extendedPalette } = useCatalog()
  const { dispatch } = useEditor()
  const actions = useCardActions()
  const [picking, setPicking] = useState(false)

  const patch = (next: Partial<CarouselCard>) =>
    dispatch({ type: "card/update", id: card.id, patch: next })

  /** Escolher um layout com imagem num card sem arte cria a arte na hora. */
  function setLayout(layout: CardLayout) {
    const needsImage = layout !== "no-image" && card.image === null
    patch({ layout, ...(needsImage ? { image: defaultImage(index + 7) } : {}) })
  }

  return (
    <div className="flex h-full w-60 flex-col">
      <PanelHeader
        icon={<Square className="size-4 text-muted-foreground" />}
        title={t("editor.cardPanel.title", { number: index + 1 })}
      />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        <Section label={t("editor.cardPanel.layout")}>
          <div className="grid grid-cols-5 gap-1.5">
            {LAYOUTS.map((layout) => (
              <OptionTile
                key={layout}
                label={t(`editor.cardPanel.layouts.${layout}`)}
                selected={card.layout === layout}
                onClick={() => setLayout(layout)}
                className="aspect-4/5"
              >
                <LayoutPreview layout={layout} />
              </OptionTile>
            ))}
          </div>
        </Section>

        <Section label={t("editor.cardPanel.align")}>
          <ToggleGroup
            value={[card.align]}
            onValueChange={(groupValue) => {
              const next = groupValue[0] as VerticalAlign | undefined
              if (next) patch({ align: next })
            }}
          >
            {V_ALIGNS.map(({ value, icon: Icon }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                aria-label={t(`editor.cardPanel.aligns.${value}`)}
              >
                <Icon />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Section>

        <Section label={t("editor.cardPanel.background")}>
          <div className="flex flex-wrap items-center gap-1.5">
            {([theme.bg, theme.surface, theme.accent, theme.ink] as const).map(
              (color, i) => (
                <Swatch
                  key={`${color}-${i}`}
                  color={color}
                  label={t("editor.cardPanel.backgroundSwatchAria")}
                  selected={card.bg === color}
                  onClick={() => patch({ bg: color })}
                />
              )
            )}
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                  />
                }
              >
                {t("editor.cardPanel.moreColors")}
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="grid grid-cols-6 gap-1.5">
                  {extendedPalette.map((color) => (
                    <Swatch
                      key={color}
                      color={color}
                      label={t("editor.cardPanel.backgroundSwatchAria")}
                      selected={card.bg === color}
                      onClick={() => patch({ bg: color })}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {card.bg !== null && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 h-7 text-xs text-muted-foreground"
              onClick={() => patch({ bg: null })}
            >
              {t("editor.cardPanel.resetBackground")}
            </Button>
          )}
        </Section>

        {card.image && card.layout !== "no-image" && (
          <>
            <Section label={t("editor.cardPanel.imageSource")}>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => setPicking(true)}
              >
                <ImageIcon />
                {t(`editor.cardPanel.imageSources.${card.image.source.kind}`)}
              </Button>
            </Section>
            <ImageFrame
              image={card.image}
              theme={theme}
              onChange={(image) => patch({ image })}
            />
          </>
        )}
      </div>

      {card.image && (
        <ImagePicker
          open={picking}
          onOpenChange={setPicking}
          theme={theme}
          source={card.image.source}
          onPick={(source) =>
            patch({ image: { ...card.image!, source, ...CENTER_FRAME } })
          }
        />
      )}

      <div className="flex shrink-0 items-center gap-1.5 border-t p-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => actions.duplicate(card.id)}
        >
          <Copy /> {t("common.duplicate")}
        </Button>
        <Button
          variant="destructive"
          size="icon-sm"
          className="ml-auto"
          aria-label={t("editor.cardActions.remove")}
          onClick={() => actions.remove(card.id)}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

/** Diagrama do layout: a faixa cheia é onde a imagem entra. */
function LayoutPreview({ layout }: { layout: CardLayout }) {
  const image = "bg-primary/70"
  const text = "bg-muted-foreground/25"

  if (layout === "no-image") {
    return (
      <div className="flex h-full flex-col justify-center gap-1 p-1.5">
        <div className={cn("h-1 w-full rounded-full", text)} />
        <div className={cn("h-1 w-3/4 rounded-full", text)} />
      </div>
    )
  }
  if (layout === "image-full") {
    return (
      <div className={cn("relative h-full w-full", image)}>
        <div className="absolute inset-x-1.5 bottom-2 space-y-1">
          <div className="h-1 w-full rounded-full bg-background/80" />
          <div className="h-1 w-2/3 rounded-full bg-background/60" />
        </div>
      </div>
    )
  }
  if (layout === "image-top") {
    return (
      <div className="flex h-full flex-col">
        <div className={cn("h-2/5 w-full", image)} />
        <div className="flex-1 space-y-1 p-1.5">
          <div className={cn("h-1 w-full rounded-full", text)} />
          <div className={cn("h-1 w-2/3 rounded-full", text)} />
        </div>
      </div>
    )
  }
  const first = layout === "image-left"
  return (
    <div className="flex h-full">
      {first && <div className={cn("h-full w-2/5", image)} />}
      <div className="flex-1 space-y-1 self-center p-1">
        <div className={cn("h-1 w-full rounded-full", text)} />
        <div className={cn("h-1 w-2/3 rounded-full", text)} />
      </div>
      {!first && <div className={cn("h-full w-2/5", image)} />}
    </div>
  )
}
