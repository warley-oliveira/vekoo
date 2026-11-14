import { useMemo, useState } from "react"
import { Controller, useFieldArray } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Plus, X } from "lucide-react"

import { AddButton, List, ListRow } from "@/components/brand/list-row"
import { useRegisterStep, useWizard } from "@/components/brand/brand-wizard-context"
import { useStepForm } from "@/components/brand/use-step-form"
import { Field } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { QUALITY_RULES, TONES, buildStepSchemas, newBannedWord, newExample, type Tone } from "@/lib/brand-core"

export function StepVoice() {
  const { t } = useTranslation()
  const { brandCore, previewSection } = useWizard()
  const schema = useMemo(() => buildStepSchemas(t).voice, [t])
  const { form, status, commit, retry } = useStepForm({
    section: "voice",
    defaults: brandCore.document.voice,
    schema,
    onChange: (values) => previewSection("voice", values),
  })
  useRegisterStep(commit, status, retry)

  const { register, control, formState: { errors } } = form
  const banned = useFieldArray({ control, name: "bannedWords" })
  const examples = useFieldArray({ control, name: "examples" })
  const [draftWord, setDraftWord] = useState("")

  function addWord() {
    const text = draftWord.trim()
    if (!text) return
    banned.append({ ...newBannedWord(), text })
    setDraftWord("")
  }

  return (
    <form noValidate className="space-y-7" onSubmit={(e) => e.preventDefault()}>
      <Field label={t("brand.voice.essence")} hint={t("brand.voice.essenceHint")} error={errors.essence?.message}>
        {(field) => (
          <Input {...field} {...register("essence")} autoFocus placeholder={t("brand.voice.essencePlaceholder")} maxLength={160} />
        )}
      </Field>

      <Controller
        control={control}
        name="tones"
        render={({ field, fieldState }) => (
          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("brand.voice.tones")}</span>
            <ToggleGroup
              multiple
              value={field.value}
              onValueChange={(value) => field.onChange(value as Tone[])}
              variant="outline"
              className="flex-wrap"
              aria-label={t("brand.voice.tones")}
              aria-invalid={Boolean(fieldState.error)}
            >
              {TONES.map((tone) => (
                <ToggleGroupItem key={tone} value={tone}>{t(`brand.voice.toneOptions.${tone}`)}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p role={fieldState.error ? "alert" : undefined} className={fieldState.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {fieldState.error?.message ?? t("brand.voice.tonesHint")}
            </p>
          </div>
        )}
      />

      <Field label={t("brand.voice.toneNote")} error={errors.toneNote?.message}>
        {(field) => <Input {...field} {...register("toneNote")} placeholder={t("brand.voice.toneNotePlaceholder")} />}
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("brand.voice.bannedWords")}</legend>
        <p className="-mt-1 text-xs text-muted-foreground">{t("brand.voice.bannedHint")}</p>
        {banned.fields.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={t("brand.voice.bannedWords")}>
            {banned.fields.map((item, index) => (
              <li key={item.id} className="flex items-center gap-1 rounded-full border bg-card pl-3 text-sm">
                <input {...register(`bannedWords.${index}.text`)} className="w-auto min-w-0 bg-transparent py-1 outline-none" size={Math.max(4, item.text.length)} aria-invalid={Boolean(errors.bannedWords?.[index]?.text)} />
                <Button type="button" variant="ghost" size="icon-xs" className="rounded-full" onClick={() => banned.remove(index)} aria-label={t("brand.identity.remove")}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex max-w-md gap-2">
          <Input
            value={draftWord}
            onChange={(e) => setDraftWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addWord()
              }
            }}
            placeholder={t("brand.voice.bannedPlaceholder")}
            aria-label={t("brand.voice.bannedWords")}
          />
          <Button type="button" variant="outline" onClick={addWord} disabled={!draftWord.trim()}>
            <Plus /> {t("brand.voice.addBanned")}
          </Button>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("brand.voice.qualityRules")}</legend>
        <p className="-mt-1 text-xs text-muted-foreground">{t("brand.voice.qualityHint")}</p>
        <ul className="space-y-2">
          {QUALITY_RULES.map((rule) => (
            <li key={rule}>
              <Controller
                control={control}
                name={`qualityRules.${rule}`}
                render={({ field }) => (
                  <Label className="flex cursor-pointer items-center gap-2.5 text-sm font-normal">
                    <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                    {t(`brand.voice.rules.${rule}`)}
                  </Label>
                )}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("brand.voice.examples")}</legend>
        <p className="-mt-1 text-xs text-muted-foreground">{t("brand.voice.examplesHint")}</p>
        <List>
          {examples.fields.map((item, index) => (
            <ListRow key={item.id} removeLabel={t("brand.identity.remove")} onRemove={() => examples.remove(index)}>
              <Textarea {...register(`examples.${index}.text`)} rows={3} placeholder={t("brand.voice.examplePlaceholder")} maxLength={600} />
            </ListRow>
          ))}
        </List>
        <AddButton onClick={() => examples.append(newExample())}>{t("brand.voice.addExample")}</AddButton>
      </fieldset>
    </form>
  )
}
