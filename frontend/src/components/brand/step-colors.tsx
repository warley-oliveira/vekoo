import { useMemo } from "react"
import { Controller, useFieldArray, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Check, Circle, Palette } from "lucide-react"

import { ColorField } from "@/components/brand/color-field"
import { AddButton, List, ListRow } from "@/components/brand/list-row"
import { useRegisterStep, useWizard } from "@/components/brand/brand-wizard-context"
import { useStepForm } from "@/components/brand/use-step-form"
import { EmptyState } from "@/components/empty-state"
import { Field } from "@/components/form-field"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  COLOR_ROLES,
  backgroundPairs,
  buildStepSchemas,
  contrastLevel,
  contrastRatio,
  newColor,
  paletteRules,
  starterPalette,
  type BrandColor,
  type ColorRole,
} from "@/lib/brand-core"
import { cn } from "@/lib/utils"

export function StepColors() {
  const { t } = useTranslation()
  const { brandCore, previewSection } = useWizard()
  const schema = useMemo(() => buildStepSchemas(t).palette, [t])
  const { form, status, commit, retry } = useStepForm({
    section: "palette",
    defaults: brandCore.document.palette,
    schema,
    onChange: (values) => previewSection("palette", values),
  })
  useRegisterStep(commit, status, retry)

  const { register, control, formState: { errors } } = form
  const colors = useFieldArray({ control, name: "colors" })
  const watched = (useWatch({ control, name: "colors" }) ?? []) as BrandColor[]
  const rules = paletteRules(watched)
  const roleLabels = useMemo(
    () => Object.fromEntries(COLOR_ROLES.map((r) => [r, t(`brand.colors.roles.${r}`)])),
    [t]
  )
  const listError = errors.colors?.message ?? errors.colors?.root?.message

  return (
    <form noValidate className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <p className="text-sm text-muted-foreground">{t("brand.colors.intro")}</p>

      {colors.fields.length === 0 ? (
        <EmptyState
          icon={<Palette className="size-6" />}
          title={t("brand.colors.empty")}
          description={t("brand.colors.starterHint")}
          action={{ label: t("brand.colors.starter"), onClick: () => colors.replace(starterPalette()) }}
        />
      ) : (
        <List aria-label={t("brand.steps.colors.title")}>
          {colors.fields.map((item, index) => (
            <ListRow key={item.id} removeLabel={t("brand.colors.remove")} onRemove={() => colors.remove(index)}>
              <div className="grid gap-3 sm:grid-cols-[auto_1fr_minmax(11rem,0.8fr)]">
                <Controller
                  control={control}
                  name={`colors.${index}.hex`}
                  render={({ field, fieldState }) => (
                    <div className="space-y-1">
                      <ColorField
                        value={field.value}
                        onChange={field.onChange}
                        invalid={Boolean(fieldState.error)}
                        aria-label={t("brand.colors.hex")}
                      />
                      {fieldState.error && (
                        <p role="alert" className="text-xs text-destructive">{fieldState.error.message}</p>
                      )}
                    </div>
                  )}
                />
                <Field label={t("brand.colors.name")} error={errors.colors?.[index]?.name?.message} className="space-y-1">
                  {(field) => (
                    <Input {...field} {...register(`colors.${index}.name`)} placeholder={t("brand.colors.namePlaceholder")} />
                  )}
                </Field>
                <Controller
                  control={control}
                  name={`colors.${index}.role`}
                  render={({ field }) => (
                    <div className="space-y-1">
                      <span className="text-sm font-medium">{t("brand.colors.role")}</span>
                      <Select value={field.value} items={roleLabels} onValueChange={(v) => field.onChange(v as ColorRole)}>
                        <SelectTrigger className="w-full" aria-label={t("brand.colors.role")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COLOR_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              <span className="flex flex-col">
                                <span>{roleLabels[role]}</span>
                                <span className="text-xs text-muted-foreground">{t(`brand.colors.roleHints.${role}`)}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                />
              </div>
            </ListRow>
          ))}
        </List>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <AddButton onClick={() => colors.append(newColor(rules.accent ? "muted" : "accent"))}>
          {t("brand.colors.addColor")}
        </AddButton>
        {listError && <p role="alert" className="text-sm text-destructive">{listError}</p>}
      </div>

      <section className="rounded-lg border p-4">
        <h3 className="text-sm font-medium">{t("brand.colors.rulesTitle")}</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {(Object.entries(rules) as [keyof typeof rules, boolean][]).map(([rule, met]) => (
            <li key={rule} className={cn("flex items-center gap-2", met ? "text-foreground" : "text-muted-foreground")}>
              {met ? <Check className="size-4 text-primary" aria-hidden /> : <Circle className="size-4" aria-hidden />}
              {t(`brand.colors.rules.${rule}`)}
            </li>
          ))}
        </ul>
      </section>

      <PalettePreview colors={watched} />
    </form>
  )
}

/** Cada fundo com o seu texto — e o contraste medido, não chutado. */
function PalettePreview({ colors }: { colors: BrandColor[] }) {
  const { t } = useTranslation()
  const pairs = backgroundPairs(colors)

  return (
    <section aria-label={t("brand.colors.previewTitle")} className="space-y-2">
      <h3 className="text-sm font-medium">{t("brand.colors.previewTitle")}</h3>
      {pairs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("brand.colors.previewEmpty")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pairs.map(({ background, text, accent }) => {
            const ratio = text ? contrastRatio(background.hex, text.hex) : 0
            const level = contrastLevel(ratio)
            return (
              <div
                key={background.id}
                className="space-y-2 p-5"
                style={{ backgroundColor: background.hex, color: text?.hex ?? "var(--muted-foreground)" }}
              >
                <p className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: accent?.hex ?? undefined }}>
                  {t("brand.colors.previewAccentSample")}
                </p>
                <p className="font-heading text-xl leading-tight font-semibold">
                  {text ? t("brand.colors.previewTitleSample") : t("brand.colors.previewMissingText")}
                </p>
                <p className="text-sm">{t("brand.colors.previewBodySample")}</p>
                {text && (
                  <Badge
                    variant={level === "fail" ? "destructive" : "secondary"}
                    className="mt-2 tabular-nums"
                  >
                    {ratio.toFixed(1)}:1 · {t(`brand.colors.contrast.${level}`)}
                  </Badge>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
