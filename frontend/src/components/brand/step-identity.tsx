import { useId, useMemo } from "react"
import { Controller, useFieldArray } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { ArchetypePicker } from "@/components/brand/archetype-picker"
import { AddButton, List, ListRow } from "@/components/brand/list-row"
import { useRegisterStep, useWizard } from "@/components/brand/brand-wizard-context"
import { LogoBlock } from "@/components/brand/logo-block"
import { useStepForm } from "@/components/brand/use-step-form"
import { Field } from "@/components/form-field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  NETWORKS,
  buildStepSchemas,
  newCharacter,
  newNetwork,
  type Network,
} from "@/lib/brand-core"
import { NICHES, type Niche } from "@/lib/taxonomy"

// O valor do item "deixar sem nicho": o documento guarda vazio.
const NO_NICHE = "none"

export function StepIdentity() {
  const { t } = useTranslation()
  const { brandCore, previewSection } = useWizard()
  const schema = useMemo(() => buildStepSchemas(t).identity, [t])
  const { form, status, commit, retry } = useStepForm({
    section: "identity",
    defaults: brandCore.document.identity,
    schema,
    onChange: (values) => previewSection("identity", values),
  })
  useRegisterStep(commit, status, retry)

  const { register, control, formState: { errors } } = form
  const characters = useFieldArray({ control, name: "characters" })
  const networks = useFieldArray({ control, name: "networks" })
  const networkLabels = useMemo(
    () => Object.fromEntries(NETWORKS.map((n) => [n, t(`brand.networks.${n}`)])),
    [t]
  )
  const nicheLabels = useMemo<Record<string, string>>(
    () => ({
      ...Object.fromEntries(NICHES.map((n) => [n, t(`taxonomy.niches.${n}`)])),
      [NO_NICHE]: t("brand.identity.nicheNone"),
    }),
    [t]
  )
  const archetypesLabelId = useId()
  const archetypesHintId = useId()

  return (
    <form noValidate className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("brand.identity.name")} error={errors.name?.message}>
          {(field) => (
            <Input {...field} {...register("name")} autoFocus placeholder={t("brand.identity.namePlaceholder")} />
          )}
        </Field>
        <Field label={t("brand.identity.segment")} error={errors.segment?.message}>
          {(field) => (
            <Input {...field} {...register("segment")} placeholder={t("brand.identity.segmentPlaceholder")} />
          )}
        </Field>
      </div>

      <Field label={t("brand.identity.concept")} hint={t("brand.identity.conceptHint")} error={errors.concept?.message}>
        {(field) => (
          <Input {...field} {...register("concept")} placeholder={t("brand.identity.conceptPlaceholder")} maxLength={160} />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("brand.identity.niche")} hint={t("brand.identity.nicheHint")} error={errors.niche?.message}>
          {(field) => (
            <Controller
              control={control}
              name="niche"
              render={({ field: niche }) => (
                <Select
                  value={(niche.value || null) as string | null}
                  items={nicheLabels}
                  onValueChange={(v) => niche.onChange(v === NO_NICHE || v === null ? "" : (v as Niche))}
                >
                  <SelectTrigger id={field.id} aria-describedby={field["aria-describedby"]} className="w-full">
                    <SelectValue placeholder={t("brand.identity.nichePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHES.map((code) => (
                      <SelectItem key={code} value={code}>{nicheLabels[code]}</SelectItem>
                    ))}
                    {niche.value && <SelectItem value={NO_NICHE}>{nicheLabels[NO_NICHE]}</SelectItem>}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </Field>
      </div>

      {/* A logo e as ações dela (baixar, trocar, regenerar): o cartão da
          marca é só leitura. Fora do formulário — cada ação salva sozinha. */}
      <LogoBlock brandCore={brandCore} />

      <Field label={t("brand.identity.audience")} error={errors.audience?.message}>
        {(field) => (
          <Textarea
            {...field}
            {...register("audience")}
            rows={2}
            placeholder={t("brand.identity.audiencePlaceholder")}
            maxLength={600}
          />
        )}
      </Field>

      <Field label={t("brand.identity.positioning")} error={errors.positioning?.message}>
        {(field) => (
          <Textarea
            {...field}
            {...register("positioning")}
            rows={3}
            placeholder={t("brand.identity.positioningPlaceholder")}
            maxLength={600}
          />
        )}
      </Field>

      <div className="space-y-1.5">
        <span id={archetypesLabelId} className="text-sm font-medium">{t("brand.identity.archetypes")}</span>
        <p id={archetypesHintId} className="text-xs text-muted-foreground">{t("brand.identity.archetypesHint")}</p>
        <Controller
          control={control}
          name="archetypes"
          render={({ field }) => (
            <ArchetypePicker
              value={field.value}
              onChange={field.onChange}
              labelId={archetypesLabelId}
              hintId={archetypesHintId}
            />
          )}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("brand.identity.characters")}</legend>
        <p className="-mt-1 text-xs text-muted-foreground">{t("brand.identity.charactersHint")}</p>
        <List>
          {characters.fields.map((item, index) => (
            <ListRow key={item.id} removeLabel={t("brand.identity.remove")} onRemove={() => characters.remove(index)}>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <Field label={t("brand.identity.characterName")} error={errors.characters?.[index]?.name?.message}>
                  {(field) => <Input {...field} {...register(`characters.${index}.name`)} />}
                </Field>
                <Field label={t("brand.identity.characterRole")} error={errors.characters?.[index]?.role?.message}>
                  {(field) => (
                    <Input {...field} {...register(`characters.${index}.role`)} placeholder={t("brand.identity.characterRolePlaceholder")} />
                  )}
                </Field>
              </div>
            </ListRow>
          ))}
        </List>
        <AddButton onClick={() => characters.append(newCharacter())}>{t("brand.identity.addCharacter")}</AddButton>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("brand.identity.address")} error={errors.address?.message}>
          {(field) => (
            <Input {...field} {...register("address")} autoComplete="street-address" placeholder={t("brand.identity.addressPlaceholder")} />
          )}
        </Field>
        <Field label={t("brand.identity.instagram")} error={errors.instagram?.message}>
          {(field) => (
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground" aria-hidden>
                @
              </span>
              <Input {...field} {...register("instagram")} className="pl-7" spellCheck={false} autoCapitalize="none" />
            </div>
          )}
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("brand.identity.networks")}</legend>
        <List>
          {networks.fields.map((item, index) => (
            <ListRow key={item.id} removeLabel={t("brand.identity.remove")} onRemove={() => networks.remove(index)}>
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <Controller
                  control={control}
                  name={`networks.${index}.network`}
                  render={({ field }) => (
                    <Select value={field.value} items={networkLabels} onValueChange={(v) => field.onChange(v as Network)}>
                      <SelectTrigger className="w-full" aria-label={t("brand.identity.networks")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NETWORKS.map((network) => (
                          <SelectItem key={network} value={network}>{networkLabels[network]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Field label={t("brand.identity.networkHandle")} error={errors.networks?.[index]?.handle?.message} className="space-y-1">
                  {(field) => <Input {...field} {...register(`networks.${index}.handle`)} spellCheck={false} />}
                </Field>
              </div>
            </ListRow>
          ))}
        </List>
        <AddButton onClick={() => networks.append(newNetwork())}>{t("brand.identity.addNetwork")}</AddButton>
      </fieldset>
    </form>
  )
}
