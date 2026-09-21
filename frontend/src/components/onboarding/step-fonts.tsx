import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { BrandPreview } from "@/components/onboarding/brand-preview"
import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { SuggestionPicker } from "@/components/onboarding/suggestion-picker"
import { Field } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FONT_CATALOG, ensureCatalogFont, findCatalogFont, fontStack } from "@/lib/font-catalog"
import type { BrandFont, BrandTypography } from "@/lib/brand-core"
import type { FontsOption } from "@/lib/onboarding"

function toFont(family: string, wanted: number[]): BrandFont {
  const catalog = findCatalogFont(family)
  const weights = wanted
    .map((weight) => catalog?.weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a)) ?? weight)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((a, b) => a - b)
  return { family, source: "catalog", weights, usage: "", assetId: null }
}

/**
 * "Tem fontes da marca?"
 *
 * Duas fontes e só: uma display, que dá o caráter, e uma utilitária, que
 * some e deixa ler. Não se pergunta tamanho, peso nem hierarquia — isso sai
 * dos defaults e fica no modo de edição para quem quiser.
 *
 * No onboarding só existe o catálogo aberto: quem tem arquivo de fonte
 * licenciada é a exceção, e sobe o arquivo depois, na etapa de tipografia do
 * modo de edição.
 */
export function StepFonts({ brandCore, onAnswer, onBack, busy }: StepProps) {
  const { t } = useTranslation()
  const typography = brandCore.document.typography
  const [mode, setMode] = useState<"choose" | "own">(() =>
    typography.display.family ? "own" : "choose"
  )
  const [display, setDisplay] = useState(typography.display.family)
  const [utility, setUtility] = useState(typography.utility.family)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<number | null>(null)
  const [proposal, setProposal] = useState<{ display: string; utility: string } | null>(null)

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return FONT_CATALOG.slice(0, 8)
    return FONT_CATALOG.filter((font) => font.family.toLowerCase().includes(query)).slice(0, 8)
  }, [search])

  const pair = mode === "own" ? (display ? { display, utility: utility || display } : null) : proposal

  function submit() {
    if (!pair) return
    const next: BrandTypography = {
      ...typography,
      display: toFont(pair.display, [600, 700]),
      utility: toFont(pair.utility, [400, 500]),
    }
    onAnswer({ typography: next })
  }

  return (
    <OnboardingShell
      step="fonts"
      title={t("onboarding.fonts.title")}
      description={t("onboarding.fonts.description")}
      onContinue={submit}
      canContinue={Boolean(pair)}
      onBack={onBack}
      busy={busy}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "own" ? "default" : "outline"} size="sm" onClick={() => setMode("own")}>
            {t("onboarding.fonts.haveFonts")}
          </Button>
          <Button variant={mode === "choose" ? "default" : "outline"} size="sm" onClick={() => setMode("choose")}>
            {t("onboarding.fonts.suggestMe")}
          </Button>
        </div>

        {mode === "own" ? (
          <div className="space-y-4">
            <Field label={t("onboarding.fonts.searchLabel")} hint={t("onboarding.fonts.searchHint")}>
              {(field) => (
                <Input
                  {...field}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("onboarding.fonts.searchPlaceholder")}
                  autoFocus
                />
              )}
            </Field>

            <ul className="grid gap-2 sm:grid-cols-2" aria-label={t("onboarding.fonts.catalogAria")}>
              {matches.map((font) => {
                const active = display === font.family
                return (
                  <li key={font.family}>
                    <button
                      type="button"
                      onMouseEnter={() => ensureCatalogFont(font.family)}
                      onFocus={() => ensureCatalogFont(font.family)}
                      onClick={() => {
                        ensureCatalogFont(font.family)
                        setDisplay(font.family)
                        if (!utility) setUtility("Inter")
                      }}
                      aria-pressed={active}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? "border-primary ring-3 ring-ring/30" : ""}`}
                    >
                      <span
                        className="block truncate text-lg leading-tight"
                        style={{ fontFamily: fontStack(font.family, font.category) }}
                      >
                        {brandCore.document.identity.name || font.family}
                      </span>
                      <span className="text-xs text-muted-foreground">{font.family}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">{t("onboarding.fonts.pairHint")}</p>
          </div>
        ) : (
          <SuggestionPicker<FontsOption>
            brandId={brandCore.id}
            kind="fonts"
            auto
            label={t("onboarding.fonts.optionsAria")}
            selectedIndex={selected}
            onSelect={(option, index) => {
              setProposal({ display: option.display.family, utility: option.utility.family })
              setSelected(index)
            }}
            render={(option) => (
              <FontPairPreview
                option={option}
                name={brandCore.document.identity.name}
                concept={brandCore.document.identity.concept}
              />
            )}
          />
        )}

        {pair && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t("onboarding.preview.title")}</p>
            <BrandPreview
              name={brandCore.document.identity.name}
              concept={brandCore.document.identity.concept}
              colors={brandCore.document.palette.colors}
              display={pair.display}
              utility={pair.utility}
              className="max-w-xs"
            />
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}

/** O par aplicado ao nome do negócio — não a duas linhas de "Aa Bb Cc". */
function FontPairPreview({ option, name, concept }: { option: FontsOption; name: string; concept: string }) {
  const { t } = useTranslation()
  ensureCatalogFont(option.display.family)
  ensureCatalogFont(option.utility.family)

  return (
    <div className="space-y-1.5 p-4">
      <p
        className="truncate text-2xl leading-tight font-bold"
        style={{ fontFamily: fontStack(option.display.family, findCatalogFont(option.display.family)?.category) }}
      >
        {name || t("onboarding.preview.name")}
      </p>
      <p
        className="line-clamp-2 text-sm text-muted-foreground"
        style={{ fontFamily: fontStack(option.utility.family, findCatalogFont(option.utility.family)?.category) }}
      >
        {concept || t("onboarding.preview.concept")}
      </p>
      <p className="pt-1 text-xs text-muted-foreground">
        {option.display.family} + {option.utility.family}
        {option.why ? ` · ${option.why}` : ""}
      </p>
    </div>
  )
}
