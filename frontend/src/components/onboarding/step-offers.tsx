import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, X } from "lucide-react"

import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { newOffer, type BrandOffer } from "@/lib/brand-core"

/**
 * "Quer cadastrar seus principais produtos e preços agora?"
 *
 * Adição rápida: três campos numa linha, sem rótulo por cima de cada um. É a
 * única fonte de preço que o assistente pode usar depois — sem esta lista ele
 * pergunta em vez de inventar —, mas é opcional de propósito: preço é a coisa
 * que a pessoa mais volta para ajustar, e travar o cadastro aqui seria perder
 * a marca inteira.
 */
export function StepOffers({ brandCore, onAnswer, onSkip, onBack, busy }: StepProps) {
  const { t } = useTranslation()
  const [items, setItems] = useState<BrandOffer[]>(() =>
    brandCore.document.offers.items.length > 0 ? brandCore.document.offers.items : [newOffer()]
  )

  const filled = items.filter((item) => item.name.trim())

  function update(index: number, patch: Partial<BrandOffer>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  return (
    <OnboardingShell
      step="offers"
      title={t("onboarding.offers.title")}
      description={t("onboarding.offers.description")}
      onContinue={() => onAnswer({ offers: { items: filled } })}
      onSkip={onSkip}
      onBack={onBack}
      busy={busy}
    >
      <div className="space-y-4">
        <ul className="space-y-2" aria-label={t("onboarding.offers.listAria")}>
          {items.map((item, index) => (
            <li key={item.id} className="flex items-start gap-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <Input
                  value={item.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  placeholder={t("onboarding.offers.namePlaceholder")}
                  aria-label={t("brand.offers.name")}
                  maxLength={80}
                  autoFocus={index === 0}
                />
                <Input
                  value={item.price}
                  onChange={(event) => update(index, { price: event.target.value })}
                  placeholder={t("onboarding.offers.pricePlaceholder")}
                  aria-label={t("brand.offers.price")}
                  maxLength={80}
                />
                <Input
                  value={item.description}
                  onChange={(event) => update(index, { description: event.target.value })}
                  placeholder={t("onboarding.offers.descriptionPlaceholder")}
                  aria-label={t("brand.offers.description")}
                  maxLength={160}
                  className="sm:col-span-2"
                />
              </div>
              {items.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mt-0.5"
                  onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                  aria-label={t("brand.offers.remove", { name: item.name || t("brand.offers.unnamed") })}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>

        <Button variant="outline" size="sm" onClick={() => setItems((c) => [...c, newOffer()])}>
          <Plus /> {t("onboarding.offers.add")}
        </Button>

        <p className="text-xs text-muted-foreground">{t("onboarding.offers.hint")}</p>
      </div>
    </OnboardingShell>
  )
}
