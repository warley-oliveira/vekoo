import { useTranslation } from "react-i18next"
import { Check, Palette } from "lucide-react"

import { useEditor } from "@/components/editor/editor-store"
import { OptionTile, Section, Swatch } from "@/components/editor/panel-controls"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ACCENT_CHOICES,
  FORMAT_RATIOS,
  readableInk,
  THEME_PRESETS,
  type CarouselFormat,
  type CarouselTheme,
} from "@/lib/doc"
import { cn } from "@/lib/utils"

// Aparência do carrossel inteiro: proporção e paleta. Fica no topo porque vale
// para todos os cards — nada aqui é propriedade de um card só.

const FORMATS: readonly CarouselFormat[] = ["4:5", "1:1"]

function sameTheme(a: CarouselTheme, b: CarouselTheme): boolean {
  return a.bg === b.bg && a.ink === b.ink && a.accent === b.accent
}

export function AppearancePopover() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const { theme, format } = state.doc

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted-foreground md:flex"
          />
        }
      >
        <Palette />
        {t("editor.appearance.trigger")}
      </PopoverTrigger>

      <PopoverContent className="w-72 gap-4 p-3" align="end">
        <Section label={t("editor.appearance.format")}>
          <div className="flex gap-1.5">
            {FORMATS.map((option) => (
              <OptionTile
                key={option}
                label={t(`editor.appearance.formats.${option}`)}
                selected={format === option}
                onClick={() => dispatch({ type: "doc/set-format", format: option })}
                className="flex flex-1 items-center justify-center gap-2 p-2"
              >
                <span
                  aria-hidden
                  className="w-4 shrink-0 rounded-[3px] bg-muted-foreground/30"
                  style={{ aspectRatio: String(FORMAT_RATIOS[option]) }}
                />
                <span className="text-xs tabular-nums">{option}</span>
              </OptionTile>
            ))}
          </div>
        </Section>

        <Section label={t("editor.appearance.palette")}>
          <div className="grid grid-cols-4 gap-1.5">
            {THEME_PRESETS.map((preset) => {
              const selected = sameTheme(theme, preset.theme)
              return (
                <OptionTile
                  key={preset.id}
                  label={t(`editor.appearance.themes.${preset.id}`)}
                  selected={selected}
                  onClick={() =>
                    dispatch({ type: "doc/set-theme", theme: preset.theme })
                  }
                  className="relative aspect-4/5"
                >
                  <span
                    aria-hidden
                    className="flex h-full w-full flex-col justify-end gap-1 p-1.5"
                    style={{ backgroundColor: preset.theme.bg }}
                  >
                    <span
                      className="h-1 w-full rounded-full"
                      style={{ backgroundColor: preset.theme.ink, opacity: 0.85 }}
                    />
                    <span
                      className="h-1.5 w-2/3 rounded-full"
                      style={{ backgroundColor: preset.theme.accent }}
                    />
                  </span>
                  {selected && (
                    <Check
                      aria-hidden
                      className="absolute top-1 right-1 size-3.5 text-primary"
                    />
                  )}
                </OptionTile>
              )
            })}
          </div>
        </Section>

        <Section label={t("editor.appearance.accent")}>
          <div className="flex flex-wrap gap-1.5">
            {ACCENT_CHOICES.map((accent) => (
              <Swatch
                key={accent}
                color={accent}
                label={t("editor.appearance.accentSwatchAria")}
                selected={theme.accent === accent}
                onClick={() =>
                  dispatch({
                    type: "doc/set-theme",
                    theme: { ...theme, accent, accentInk: readableInk(accent) },
                  })
                }
              />
            ))}
          </div>
        </Section>

        <p className={cn("text-xs leading-relaxed text-muted-foreground")}>
          {t("editor.appearance.hint")}
        </p>
      </PopoverContent>
    </Popover>
  )
}
