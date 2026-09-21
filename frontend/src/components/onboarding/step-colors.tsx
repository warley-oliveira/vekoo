import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, X } from "lucide-react"

import { BrandPreview } from "@/components/onboarding/brand-preview"
import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { SuggestionPicker } from "@/components/onboarding/suggestion-picker"
import { ColorField } from "@/components/brand/color-field"
import { Button } from "@/components/ui/button"
import { HEX_RE, buildPalette, type BrandColor, type ColorRole } from "@/lib/brand-core"
import type { PaletteOption } from "@/lib/onboarding"

const STARTER = ["#7c3aed", "#f6f3ee"]

/**
 * "Sua marca tem cores?"
 *
 * Duas ou três cores bastam: a plataforma deriva fundo escuro, fundo claro, o
 * texto de cada um, acento e apoio — e garante o contraste. Ninguém precisa
 * responder "qual é a sua cor de texto sobre fundo escuro" para ter uma marca.
 *
 * A derivação roda aqui e no servidor com a mesma matemática
 * (`buildPalette` / `BrandCore::PaletteBuilder`): a prévia acompanha o
 * seletor sem ida e volta, e a proposta da IA chega já derivada.
 */
export function StepColors({ brandCore, onAnswer, onBack, busy }: StepProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<"choose" | "own">(() =>
    brandCore.document.palette.colors.length > 0 ? "own" : "choose"
  )
  const [picked, setPicked] = useState<string[]>(() => {
    const existing = brandCore.document.palette.colors
    if (existing.length === 0) return STARTER
    const roles: ColorRole[] = ["accent", "darkBackground", "campaign"]
    return roles.map((role) => existing.find((c) => c.role === role)?.hex).filter(Boolean) as string[]
  })
  const [selected, setSelected] = useState<number | null>(null)
  const [proposal, setProposal] = useState<BrandColor[] | null>(null)

  const label = (role: ColorRole) => t(`onboarding.colors.roles.${role}`)
  const derived = useMemo(
    () => buildPalette(picked.filter((hex) => HEX_RE.test(hex)), label),
    // `label` fecha sobre `t`, que muda com o idioma — e é isso que renomeia
    // as cores derivadas quando a pessoa troca de língua.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picked, t]
  )

  const colors = mode === "own" ? derived : proposal
  const identity = brandCore.document.identity

  return (
    <OnboardingShell
      step="colors"
      title={t("onboarding.colors.title")}
      description={t("onboarding.colors.description")}
      onContinue={() => colors && onAnswer({ palette: { colors } })}
      canContinue={Boolean(colors?.length)}
      onBack={onBack}
      busy={busy}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === "own" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("own")}
          >
            {t("onboarding.colors.haveColors")}
          </Button>
          <Button
            variant={mode === "choose" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("choose")}
          >
            {t("onboarding.colors.suggestMe")}
          </Button>
        </div>

        {mode === "own" ? (
          <div className="space-y-4">
            <ul className="space-y-2" aria-label={t("onboarding.colors.listAria")}>
              {picked.map((hex, index) => (
                <li key={index} className="flex items-center gap-2">
                  <ColorField
                    value={hex}
                    onChange={(value) =>
                      setPicked((current) => current.map((item, i) => (i === index ? value : item)))
                    }
                    aria-label={t("onboarding.colors.colorAria", { index: index + 1 })}
                    className="flex-1"
                  />
                  {picked.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPicked((current) => current.filter((_, i) => i !== index))}
                      aria-label={t("onboarding.colors.removeColor")}
                    >
                      <X />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {picked.length < 3 && (
              <Button variant="outline" size="sm" onClick={() => setPicked((c) => [...c, "#1c1a24"])}>
                <Plus /> {t("onboarding.colors.addColor")}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">{t("onboarding.colors.derivedHint")}</p>
          </div>
        ) : (
          <SuggestionPicker<PaletteOption>
            brandId={brandCore.id}
            kind="palette"
            auto
            label={t("onboarding.colors.optionsAria")}
            selectedIndex={selected}
            onSelect={(option, index) => {
              setProposal(option.colors)
              setSelected(index)
            }}
            render={(option) => (
              <div className="flex gap-3 p-2">
                <BrandPreview
                  name={identity.name}
                  concept={identity.concept}
                  colors={option.colors}
                  display={brandCore.document.typography.display.family}
                  utility={brandCore.document.typography.utility.family}
                  className="w-32 shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1.5 py-1">
                  <p className="text-sm font-medium">{option.name}</p>
                  {option.why && <p className="text-xs text-muted-foreground text-pretty">{option.why}</p>}
                  <ul className="flex flex-wrap gap-1.5 pt-1">
                    {option.colors.map((color) => (
                      <li
                        key={color.id}
                        className="size-5 rounded-full border border-black/10"
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            )}
          />
        )}

        {mode === "own" && derived.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t("onboarding.preview.title")}</p>
            <BrandPreview
              name={identity.name}
              concept={identity.concept}
              colors={derived}
              display={brandCore.document.typography.display.family}
              utility={brandCore.document.typography.utility.family}
              className="max-w-xs"
            />
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}
