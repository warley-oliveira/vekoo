import { useState } from "react"
import { useTranslation } from "react-i18next"

import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { Field } from "@/components/form-field"
import { Input } from "@/components/ui/input"

/** A primeira e única pergunta obrigatória de verdade. */
export function StepName({ brandCore, onAnswer, onBack, busy }: StepProps) {
  const { t } = useTranslation()
  const identity = brandCore.document.identity
  const [name, setName] = useState(identity.name)
  const trimmed = name.trim()

  return (
    <OnboardingShell
      step="name"
      title={t("onboarding.name.title")}
      description={t("onboarding.name.description")}
      onContinue={() => onAnswer({ identity: { ...identity, name: trimmed } })}
      canContinue={trimmed.length > 0}
      onBack={onBack}
      busy={busy}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmed) onAnswer({ identity: { ...identity, name: trimmed } })
        }}
      >
        <Field label={t("onboarding.name.label")} hint={t("onboarding.name.hint")}>
          {(field) => (
            <Input
              {...field}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("onboarding.name.placeholder")}
              maxLength={80}
              autoFocus
              className="text-base md:text-lg"
            />
          )}
        </Field>
      </form>
    </OnboardingShell>
  )
}
