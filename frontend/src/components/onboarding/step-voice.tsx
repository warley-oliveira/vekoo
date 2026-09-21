import { useState } from "react"
import { useTranslation } from "react-i18next"

import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { SuggestionPicker } from "@/components/onboarding/suggestion-picker"
import { Field } from "@/components/form-field"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { TONES, newBannedWord, type Tone } from "@/lib/brand-core"
import type { VoiceOption } from "@/lib/onboarding"

/**
 * "Como você fala com seu cliente?"
 *
 * A pessoa marca os tons e, se quiser, escreve uma linha do próprio jeito. A
 * IA redige a **essência de voz** a partir disso e sugere as palavras banidas
 * típicas do segmento — os clichês que ela provavelmente não quer repetir.
 * Ela aprova uma das três ou ajusta o texto; nunca precisa escrever do zero.
 *
 * É pulável: quem pular recebe uma voz proposta no fechamento e a vê no
 * cartão da marca antes de publicar.
 */
export function StepVoice({ brandCore, onAnswer, onSkip, onBack, busy }: StepProps) {
  const { t } = useTranslation()
  const voice = brandCore.document.voice
  const [tones, setTones] = useState<Tone[]>(voice.tones)
  const [note, setNote] = useState(voice.toneNote)
  const [essence, setEssence] = useState(voice.essence)
  const [banned, setBanned] = useState<string[]>(voice.bannedWords.map((word) => word.text))
  const [selected, setSelected] = useState<number | null>(null)

  function submit() {
    onAnswer({
      voice: {
        ...voice,
        essence: essence.trim(),
        tones,
        toneNote: note.trim(),
        bannedWords: banned.map((text) => ({ ...newBannedWord(), text })),
      },
    })
  }

  return (
    <OnboardingShell
      step="voice"
      title={t("onboarding.voice.title")}
      description={t("onboarding.voice.description")}
      onContinue={submit}
      canContinue={essence.trim().length > 0 && tones.length > 0}
      onSkip={onSkip}
      onBack={onBack}
      busy={busy}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <span className="text-sm font-medium">{t("onboarding.voice.tonesLabel")}</span>
          <ToggleGroup
            multiple
            value={tones}
            onValueChange={(value) => setTones(value as Tone[])}
            variant="outline"
            className="flex-wrap"
            aria-label={t("onboarding.voice.tonesLabel")}
          >
            {TONES.map((tone) => (
              <ToggleGroupItem key={tone} value={tone}>
                {t(`brand.voice.toneOptions.${tone}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">{t("onboarding.voice.tonesHint")}</p>
        </div>

        <Field label={t("onboarding.voice.noteLabel")} hint={t("onboarding.voice.noteHint")}>
          {(field) => (
            <Textarea
              {...field}
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 160))}
              placeholder={t("onboarding.voice.notePlaceholder")}
              rows={2}
            />
          )}
        </Field>

        <div className="space-y-2">
          <span className="text-sm font-medium">{t("onboarding.voice.essenceLabel")}</span>
          <SuggestionPicker<VoiceOption>
            brandId={brandCore.id}
            kind="voice"
            label={t("onboarding.voice.optionsAria")}
            selectedIndex={selected}
            onSelect={(option, index) => {
              setEssence(option.essence)
              if (option.tones.length > 0) setTones(option.tones)
              if (option.bannedWords.length > 0) setBanned(option.bannedWords)
              setSelected(index)
            }}
            render={(option) => (
              <div className="space-y-2 p-4">
                <p className="text-sm">{`“${option.essence}”`}</p>
                {option.bannedWords.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("onboarding.voice.bannedPreview", { words: option.bannedWords.join(", ") })}
                  </p>
                )}
                {option.why && <p className="text-xs text-muted-foreground">{option.why}</p>}
              </div>
            )}
          />
        </div>

        <Field label={t("onboarding.voice.finalLabel")} hint={t("onboarding.voice.finalHint")}>
          {(field) => (
            <Textarea
              {...field}
              value={essence}
              onChange={(event) => setEssence(event.target.value.slice(0, 160))}
              placeholder={t("onboarding.voice.finalPlaceholder")}
              rows={2}
            />
          )}
        </Field>

        {banned.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("onboarding.voice.bannedLabel")}</span>
            <ul className="flex flex-wrap gap-1.5" aria-label={t("onboarding.voice.bannedLabel")}>
              {banned.map((word) => (
                <li key={word}>
                  <Badge variant="outline">{word}</Badge>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t("onboarding.voice.bannedHint")}</p>
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}
