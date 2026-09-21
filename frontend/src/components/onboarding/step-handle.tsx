import { useState } from "react"
import { useTranslation } from "react-i18next"

import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { Field } from "@/components/form-field"
import { Input } from "@/components/ui/input"

/**
 * O @ e a cidade. Puláveis, mas valem a pergunta: o @ vai no rodapé de toda
 * peça, e a cidade é o que faz a copy dizer "aqui em Belo Horizonte" em vez
 * de nada.
 */
export function StepHandle({ brandCore, onAnswer, onSkip, onBack, busy }: StepProps) {
  const { t } = useTranslation()
  const identity = brandCore.document.identity
  const [instagram, setInstagram] = useState(identity.instagram)
  const [address, setAddress] = useState(identity.address)

  function submit() {
    onAnswer({
      identity: {
        ...identity,
        instagram: instagram.trim().replace(/^@/, ""),
        address: address.trim(),
      },
    })
  }

  return (
    <OnboardingShell
      step="handle"
      title={t("onboarding.handle.title")}
      description={t("onboarding.handle.description")}
      onContinue={submit}
      onSkip={onSkip}
      onBack={onBack}
      busy={busy}
    >
      <div className="space-y-5">
        <Field label={t("onboarding.handle.instagramLabel")} hint={t("onboarding.handle.instagramHint")}>
          {(field) => (
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground">@</span>
              <Input
                {...field}
                value={instagram}
                onChange={(event) => setInstagram(event.target.value)}
                placeholder={t("onboarding.handle.instagramPlaceholder")}
                maxLength={80}
                autoFocus
                className="pl-7"
              />
            </div>
          )}
        </Field>

        <Field label={t("onboarding.handle.cityLabel")} hint={t("onboarding.handle.cityHint")}>
          {(field) => (
            <Input
              {...field}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={t("onboarding.handle.cityPlaceholder")}
              maxLength={160}
            />
          )}
        </Field>
      </div>
    </OnboardingShell>
  )
}
