import { useMemo } from "react"
import { Controller, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { useBrandFont } from "@/components/brand/use-brand-font"
import { useRegisterStep, useWizard } from "@/components/brand/brand-wizard-context"
import { useStepForm } from "@/components/brand/use-step-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  COLOR_ROLES,
  FONT_ROLES,
  FONT_WEIGHTS,
  STYLE_TRANSFORMS,
  buildStepSchemas,
  defaultStyles,
  firstColor,
  type ColorRole,
  type FontRole,
  type StyleTransform,
  type TextStyle,
} from "@/lib/brand-core"

export function StepStyles() {
  const { t } = useTranslation()
  const { brandCore, previewSection } = useWizard()
  const schema = useMemo(() => buildStepSchemas(t).styles, [t])
  const { form, status, commit, retry } = useStepForm({
    section: "styles",
    defaults: brandCore.document.styles,
    schema,
    onChange: (values) => previewSection("styles", values),
  })
  useRegisterStep(commit, status, retry)

  const { control } = form
  const roles = (useWatch({ control, name: "roles" }) ?? []) as TextStyle[]
  const colors = brandCore.document.palette.colors
  const fontLabels = useMemo(() => Object.fromEntries(FONT_ROLES.map((r) => [r, t(`brand.typography.roles.${r}`)])), [t])
  const colorLabels = useMemo(() => Object.fromEntries(COLOR_ROLES.map((r) => [r, t(`brand.colors.roles.${r}`)])), [t])
  const weightLabels = useMemo(() => Object.fromEntries(FONT_WEIGHTS.map((w) => [String(w), String(w)])), [])

  const displayFamily = useBrandFont(brandCore.document.typography.display, brandCore.assets)
  const utilityFamily = useBrandFont(brandCore.document.typography.utility, brandCore.assets)

  const dark = firstColor(colors, "darkBackground")?.hex ?? "var(--foreground)"
  const light = firstColor(colors, "lightBackground")?.hex ?? "var(--card)"

  return (
    <form noValidate className="space-y-5" onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">{t("brand.styles.intro")}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            form.setValue("roles", defaultStyles(), { shouldDirty: true })
            toast(t("brand.styles.resetToast"))
          }}
        >
          <RotateCcw /> {t("brand.styles.reset")}
        </Button>
      </div>

      <div className="hidden grid-cols-[9rem_8rem_5rem_6rem_7rem_1fr] gap-3 px-3 text-xs font-medium text-muted-foreground md:grid">
        <span>{t("brand.styles.columns.role")}</span>
        <span>{t("brand.styles.columns.font")}</span>
        <span>{t("brand.styles.columns.size")}</span>
        <span>{t("brand.styles.columns.weight")}</span>
        <span>{t("brand.styles.columns.transform")}</span>
        <span>{t("brand.styles.columns.preview")}</span>
      </div>

      <ul className="space-y-3">
        {roles.map((role, index) => {
          const family = role.font === "display" ? displayFamily : utilityFamily
          const onDark = firstColor(colors, role.colorOnDark)?.hex ?? "var(--background)"
          const onLight = firstColor(colors, role.colorOnLight)?.hex ?? "var(--foreground)"
          const sampleStyle = {
            fontFamily: family,
            fontWeight: role.weight,
            fontSize: `${Math.min(role.size, 40) / 16}rem`,
            textTransform: role.transform === "uppercase" ? ("uppercase" as const) : undefined,
            lineHeight: 1.1,
          }
          return (
            <li key={role.key} className="grid gap-3 rounded-lg border bg-card p-3 md:grid-cols-[9rem_8rem_5rem_6rem_7rem_1fr] md:items-center">
              <div>
                <p className="text-sm font-medium">{t(`brand.styles.keys.${role.key}`)}</p>
                <p className="text-xs text-muted-foreground">{t(`brand.styles.keyHints.${role.key}`)}</p>
              </div>

              <Controller
                control={control}
                name={`roles.${index}.font`}
                render={({ field }) => (
                  <Select value={field.value} items={fontLabels} onValueChange={(v) => field.onChange(v as FontRole)}>
                    <SelectTrigger size="sm" className="w-full" aria-label={t("brand.styles.columns.font")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_ROLES.map((f) => <SelectItem key={f} value={f}>{fontLabels[f]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />

              <Controller
                control={control}
                name={`roles.${index}.size`}
                render={({ field, fieldState }) => (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={8}
                    max={200}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    aria-invalid={Boolean(fieldState.error)}
                    aria-label={t("brand.styles.columns.size")}
                    className="h-8 tabular-nums"
                  />
                )}
              />

              <Controller
                control={control}
                name={`roles.${index}.weight`}
                render={({ field }) => (
                  <Select value={String(field.value)} items={weightLabels} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger size="sm" className="w-full tabular-nums" aria-label={t("brand.styles.columns.weight")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_WEIGHTS.map((w) => <SelectItem key={w} value={String(w)}>{w}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />

              <Controller
                control={control}
                name={`roles.${index}.transform`}
                render={({ field }) => (
                  <ToggleGroup
                    value={[field.value]}
                    onValueChange={(value) => {
                      const next = value[0] as StyleTransform | undefined
                      if (next) field.onChange(next)
                    }}
                    variant="outline"
                    size="sm"
                    spacing={0}
                    aria-label={t("brand.styles.columns.transform")}
                  >
                    {STYLE_TRANSFORMS.map((tr) => (
                      <ToggleGroupItem key={tr} value={tr} className="text-xs">{tr === "uppercase" ? "AA" : "Aa"}</ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <div className="truncate px-3 py-2" style={{ backgroundColor: dark, color: onDark, ...sampleStyle }}>
                    {t("brand.styles.sample")}
                  </div>
                  <Controller
                    control={control}
                    name={`roles.${index}.colorOnDark`}
                    render={({ field }) => (
                      <Select value={field.value} items={colorLabels} onValueChange={(v) => field.onChange(v as ColorRole)}>
                        <SelectTrigger size="sm" className="w-full" aria-label={t("brand.styles.columns.onDark")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COLOR_ROLES.map((c) => <SelectItem key={c} value={c}>{colorLabels[c]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="truncate border px-3 py-2" style={{ backgroundColor: light, color: onLight, ...sampleStyle }}>
                    {t("brand.styles.sample")}
                  </div>
                  <Controller
                    control={control}
                    name={`roles.${index}.colorOnLight`}
                    render={({ field }) => (
                      <Select value={field.value} items={colorLabels} onValueChange={(v) => field.onChange(v as ColorRole)}>
                        <SelectTrigger size="sm" className="w-full" aria-label={t("brand.styles.columns.onLight")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COLOR_ROLES.map((c) => <SelectItem key={c} value={c}>{colorLabels[c]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </form>
  )
}
