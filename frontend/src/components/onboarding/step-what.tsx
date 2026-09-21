import { useState } from "react"
import { useTranslation } from "react-i18next"

import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { Field } from "@/components/form-field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SEGMENTS, type Segment } from "@/lib/onboarding"

/**
 * A pergunta que mais paga depois: é dela que sai a copy de toda peça.
 *
 * O chip de segmento **preenche** o campo de texto em vez de substituí-lo —
 * "Loja" é um começo, "Loja de bicicletas usadas" é o que faz o conteúdo
 * ficar bom. O código do chip vai junto para o servidor, separado do texto:
 * é ele que escolhe as propostas de cor e fonte mais adiante.
 */
export function StepWhat({ brandCore, onAnswer, onBack, busy }: StepProps) {
  const { t } = useTranslation()
  const identity = brandCore.document.identity
  const [concept, setConcept] = useState(identity.concept)
  const [segmentText, setSegmentText] = useState(identity.segment)
  const [segment, setSegment] = useState<Segment | null>(brandCore.onboarding.segment)

  const trimmed = concept.trim()

  function pick(value: string) {
    const code = (value || null) as Segment | null
    setSegment(code)
    // Preenche o campo só quando ele está vazio ou ainda tem o rótulo de
    // outro chip: nunca por cima do que a pessoa escreveu.
    const labels = SEGMENTS.map((s) => t(`onboarding.what.segments.${s}`))
    if (code && (!segmentText.trim() || labels.includes(segmentText.trim()))) {
      setSegmentText(t(`onboarding.what.segments.${code}`))
    }
  }

  function submit() {
    onAnswer(
      { identity: { ...identity, concept: trimmed, segment: segmentText.trim() } },
      segment ? { segment } : undefined
    )
  }

  return (
    <OnboardingShell
      step="what"
      title={t("onboarding.what.title")}
      description={t("onboarding.what.description")}
      onContinue={submit}
      canContinue={trimmed.length > 0}
      onBack={onBack}
      busy={busy}
    >
      <div className="space-y-6">
        <Field label={t("onboarding.what.conceptLabel")} hint={t("onboarding.what.conceptHint")}>
          {(field) => (
            <Textarea
              {...field}
              value={concept}
              onChange={(event) => setConcept(event.target.value.slice(0, 160))}
              placeholder={t("onboarding.what.conceptPlaceholder")}
              rows={3}
              autoFocus
              className="text-base"
            />
          )}
        </Field>

        <div className="space-y-2">
          <span className="text-sm font-medium">{t("onboarding.what.segmentLabel")}</span>
          <ToggleGroup
            value={segment ? [segment] : []}
            onValueChange={(value) => pick(String(value[0] ?? ""))}
            variant="outline"
            className="flex-wrap"
            aria-label={t("onboarding.what.segmentLabel")}
          >
            {SEGMENTS.map((option) => (
              <ToggleGroupItem key={option} value={option}>
                {t(`onboarding.what.segments.${option}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Field label={t("onboarding.what.segmentTextLabel")} hint={t("onboarding.what.segmentTextHint")}>
          {(field) => (
            <Input
              {...field}
              value={segmentText}
              onChange={(event) => setSegmentText(event.target.value)}
              placeholder={t("onboarding.what.segmentTextPlaceholder")}
              maxLength={80}
            />
          )}
        </Field>
      </div>
    </OnboardingShell>
  )
}
