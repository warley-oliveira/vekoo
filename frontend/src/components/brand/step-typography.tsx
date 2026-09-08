import { useMemo, useRef, useState } from "react"
import { Controller, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Check, ChevronsUpDown, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { useBrandFont } from "@/components/brand/use-brand-font"
import { AddButton, List, ListRow } from "@/components/brand/list-row"
import { useRegisterStep, useWizard } from "@/components/brand/brand-wizard-context"
import { useStepForm } from "@/components/brand/use-step-form"
import { Field } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useBrandCoreMutations } from "@/hooks/use-brand-core"
import {
  FONT_ROLES,
  FONT_SOURCES,
  FONT_WEIGHTS,
  buildStepSchemas,
  type BrandAsset,
  type BrandFont,
  type FontRole,
  type FontSource,
} from "@/lib/brand-core"
import { FONT_CATALOG, findCatalogFont, type FontCategory } from "@/lib/font-catalog"
import { cn } from "@/lib/utils"

const CATEGORIES: FontCategory[] = ["sans", "serif", "display", "mono"]
const SUGGESTIONS = ["noItalic", "boldIsNotEmphasis", "twoLines"] as const

export function StepTypography() {
  const { t } = useTranslation()
  const { brandCore, previewSection } = useWizard()
  const schema = useMemo(() => buildStepSchemas(t).typography, [t])
  const { form, status, commit, retry } = useStepForm({
    section: "typography",
    defaults: brandCore.document.typography,
    schema,
    onChange: (values) => previewSection("typography", values),
  })
  useRegisterStep(commit, status, retry)

  const { register, control, formState: { errors } } = form
  const rules = useWatch({ control, name: "rules" }) ?? []

  function addRule(text = "") {
    form.setValue("rules", [...rules, text], { shouldDirty: true })
  }
  function removeRule(index: number) {
    form.setValue("rules", rules.filter((_, i) => i !== index), { shouldDirty: true })
  }

  return (
    <form noValidate className="space-y-8" onSubmit={(e) => e.preventDefault()}>
      <p className="text-sm text-muted-foreground">{t("brand.typography.intro")}</p>

      {FONT_ROLES.map((role) => (
        <FontRoleEditor key={role} role={role} form={form} assets={brandCore.assets} />
      ))}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("brand.typography.rules")}</legend>
        <p className="-mt-1 text-xs text-muted-foreground">{t("brand.typography.rulesHint")}</p>
        <List>
          {rules.map((_, index) => (
            <ListRow key={index} removeLabel={t("brand.identity.remove")} onRemove={() => removeRule(index)}>
              <Input
                {...register(`rules.${index}`)}
                placeholder={t("brand.typography.rulePlaceholder")}
                aria-invalid={Boolean(errors.rules?.[index])}
              />
            </ListRow>
          ))}
        </List>
        <div className="flex flex-wrap gap-2">
          <AddButton onClick={() => addRule()}>{t("brand.typography.addRule")}</AddButton>
          {SUGGESTIONS.map((key) => {
            const text = t(`brand.typography.suggestions.${key}`)
            const used = rules.includes(text)
            return (
              <Button key={key} type="button" variant="ghost" size="sm" disabled={used} onClick={() => addRule(text)}>
                {used && <Check />} {text}
              </Button>
            )
          })}
        </div>
      </fieldset>
    </form>
  )
}

type FontRoleEditorProps = {
  role: FontRole
  form: ReturnType<typeof useStepForm<"typography">>["form"]
  assets: BrandAsset[]
}

function FontRoleEditor({ role, form, assets }: FontRoleEditorProps) {
  const { t } = useTranslation()
  const { control, register, setValue, formState: { errors } } = form
  const font = useWatch({ control, name: role }) as BrandFont
  const catalogFont = findCatalogFont(font.family)
  const available = font.source === "catalog" && catalogFont ? catalogFont.weights : [...FONT_WEIGHTS]
  const previewFamily = useBrandFont(font, assets)
  const roleErrors = errors[role]

  const { uploadAsset } = useBrandCoreMutations()
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const fileAsset = assets.find((a) => a.id === font.assetId)

  async function upload(file: File) {
    setUploading(true)
    try {
      const asset = await uploadAsset("font", role, file)
      setValue(`${role}.assetId`, asset.id, { shouldDirty: true, shouldValidate: true })
      if (!font.family) {
        setValue(`${role}.family`, file.name.replace(/\.(ttf|otf|woff2)$/i, ""), { shouldDirty: true })
      }
    } catch {
      toast.error(t("brand.typography.uploadFailed"))
    } finally {
      setUploading(false)
    }
  }

  return (
    <fieldset className="space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">
        {t(`brand.typography.roles.${role}`)}
        <span className="ml-2 font-normal text-muted-foreground">{t(`brand.typography.roleHints.${role}`)}</span>
      </legend>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <Controller
          control={control}
          name={`${role}.source`}
          render={({ field }) => (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">{t("brand.typography.source")}</span>
              <ToggleGroup
                value={[field.value]}
                onValueChange={(value) => {
                  const next = value[0] as FontSource | undefined
                  if (next) field.onChange(next)
                }}
                variant="outline"
                spacing={0}
                aria-label={t("brand.typography.source")}
              >
                {FONT_SOURCES.map((source) => (
                  <ToggleGroupItem key={source} value={source}>{t(`brand.typography.sources.${source}`)}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
        />

        {font.source === "catalog" ? (
          <Controller
            control={control}
            name={`${role}.family`}
            render={({ field, fieldState }) => (
              <div className="space-y-1.5">
                <span className="text-sm font-medium">{t("brand.typography.family")}</span>
                <FontPicker
                  value={field.value}
                  onChange={(family) => {
                    field.onChange(family)
                    const weights = findCatalogFont(family)?.weights ?? []
                    const kept = font.weights.filter((w) => weights.includes(w))
                    setValue(`${role}.weights`, kept.length ? kept : [weights.includes(400) ? 400 : weights[0]], { shouldDirty: true })
                  }}
                  invalid={Boolean(fieldState.error)}
                />
                {fieldState.error && <p role="alert" className="text-xs text-destructive">{fieldState.error.message}</p>}
              </div>
            )}
          />
        ) : (
          <Field label={t("brand.typography.family")} error={roleErrors?.family?.message} className="space-y-1.5">
            {(field) => (
              <Input {...field} {...register(`${role}.family`)} placeholder={t("brand.typography.familyPlaceholder")} />
            )}
          </Field>
        )}
      </div>

      {font.source === "file" && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".ttf,.otf,.woff2,font/ttf,font/otf,font/woff2"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ""
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {uploading ? t("brand.typography.uploading") : fileAsset ? t("brand.typography.replace") : t("brand.typography.upload")}
          </Button>
          {fileAsset && <span className="text-sm text-muted-foreground">{t("brand.typography.uploaded", { name: fileAsset.name })}</span>}
          {roleErrors?.assetId && <p role="alert" className="text-xs text-destructive">{roleErrors.assetId.message}</p>}
        </div>
      )}

      <Controller
        control={control}
        name={`${role}.weights`}
        render={({ field, fieldState }) => (
          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("brand.typography.weights")}</span>
            <ToggleGroup
              multiple
              value={field.value.map(String)}
              onValueChange={(value) => field.onChange(value.map(Number).sort((a, b) => a - b))}
              variant="outline"
              size="sm"
              className="flex-wrap"
              aria-label={t("brand.typography.weights")}
            >
              {available.map((weight) => (
                <ToggleGroupItem key={weight} value={String(weight)} className="tabular-nums">
                  {weight}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className={cn("text-xs", fieldState.error ? "text-destructive" : "text-muted-foreground")}>
              {fieldState.error?.message ?? t("brand.typography.weightsHint")}
            </p>
          </div>
        )}
      />

      <Field label={t("brand.typography.usage")} error={roleErrors?.usage?.message}>
        {(field) => <Input {...field} {...register(`${role}.usage`)} placeholder={t("brand.typography.usagePlaceholder")} />}
      </Field>

      {font.family && (
        <div className="space-y-1 rounded-lg bg-muted/50 p-4" style={{ fontFamily: previewFamily }} aria-hidden>
          {font.weights.map((weight) => (
            <p key={weight} className="truncate text-2xl leading-tight" style={{ fontWeight: weight }}>
              {t("brand.typography.previewSample")}
            </p>
          ))}
        </div>
      )}
    </fieldset>
  )
}

type FontPickerProps = { value: string; onChange: (family: string) => void; invalid?: boolean }

/** Busca no catálogo aberto, agrupada por categoria, com o nome na própria fonte. */
function FontPicker({ value, onChange, invalid }: FontPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const matches = FONT_CATALOG.filter((font) => font.family.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value || t("brand.typography.familyPlaceholder")}
        </span>
        <ChevronsUpDown className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-[--anchor-width] min-w-72 p-2" align="start">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("brand.typography.searchFont")}
          autoFocus
          className="mb-2"
        />
        <div className="max-h-72 overflow-y-auto" role="listbox">
          {matches.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">{t("brand.typography.noFont")}</p>}
          {CATEGORIES.map((category) => {
            const fonts = matches.filter((font) => font.category === category)
            if (fonts.length === 0) return null
            return (
              <div key={category} className="mb-1">
                <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {t(`brand.typography.categories.${category}`)}
                </p>
                {fonts.map((font) => (
                  <button
                    key={font.family}
                    type="button"
                    role="option"
                    aria-selected={font.family === value}
                    onClick={() => {
                      onChange(font.family)
                      setOpen(false)
                      setQuery("")
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
                      font.family === value && "bg-accent text-accent-foreground"
                    )}
                  >
                    <span>{font.family}</span>
                    {font.family === value && <Check className="size-4" />}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
