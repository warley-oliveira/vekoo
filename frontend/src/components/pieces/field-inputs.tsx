import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Check, Plus, X } from "lucide-react"

import { Field } from "@/components/form-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { BrandCore, BrandFact } from "@/lib/brand-core"
import { BACKGROUND_ROLES } from "@/lib/brand-core"
import { effectiveLines, type EngineField, type PieceValues } from "@/lib/engines"
import { cn } from "@/lib/utils"

// Um renderizador por **tipo de campo** do manifesto — é isto que faz a tela
// de criar peça não precisar conhecer motor nenhum. Cada um recebe o campo,
// o valor e o Brandcore (para opções derivadas, fatos e fotos).

const NONE = "__none__"

type FieldInputProps = {
  field: EngineField
  value: PieceValues[string]
  onChange: (value: PieceValues[string]) => void
  error?: string
  brandCore: BrandCore
}

export function FieldInput(props: FieldInputProps) {
  switch (props.field.type) {
    case "text": return <TextFieldInput {...props} />
    case "textList": return <TextListInput {...props} />
    case "number": return <NumberInput {...props} />
    case "choice": return <ChoiceInput {...props} />
    case "ref": return <RefInput {...props} />
    case "image": return <ImageInput {...props} />
  }
}

function labelOf(field: EngineField, t: (key: string) => string): string {
  return field.required ? field.label : `${field.label} · ${t("pieces.form.optional")}`
}

/* ---------- texto, com contadores ---------- */

function TextFieldInput({ field, value, onChange, error, brandCore: _brandCore }: FieldInputProps) {
  const { t } = useTranslation()
  const text = String(value ?? "")
  const c = field.constraints ?? {}
  const single = c.maxLines === 1
  const lines = effectiveLines(text, c.maxCharsPerLine)
  const counters = [
    c.maxLines && !single ? t("pieces.form.counters.lines", { used: lines, max: c.maxLines }) : null,
    c.maxChars ? t("pieces.form.counters.chars", { used: text.length, max: c.maxChars }) : null,
  ].filter(Boolean)
  const over = (c.maxLines && lines > c.maxLines) || (c.maxChars && text.length > c.maxChars)

  return (
    <Field label={labelOf(field, t)} hint={field.hint} error={error}>
      {(aria) => (
        <div className="space-y-1">
          {single ? (
            <Input {...aria} value={text} onChange={(e) => onChange(e.target.value)} maxLength={c.maxChars} />
          ) : (
            <Textarea
              {...aria}
              value={text}
              onChange={(e) => onChange(e.target.value)}
              rows={Math.min(c.maxLines ?? 3, 4)}
              maxLength={c.maxChars}
            />
          )}
          {counters.length > 0 && (
            <p className={cn("text-right text-[11px] tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
              {counters.join(" · ")}
            </p>
          )}
        </div>
      )}
    </Field>
  )
}

/* ---------- lista de linhas ---------- */

function TextListInput({ field, value, onChange, error }: FieldInputProps) {
  const { t } = useTranslation()
  const items = Array.isArray(value) ? value : []
  const c = field.constraints ?? {}
  const full = c.maxItems !== undefined && items.length >= c.maxItems

  function update(index: number, text: string) {
    onChange(items.map((item, i) => (i === index ? text : item)))
  }

  return (
    <Field label={labelOf(field, t)} hint={field.hint} error={error}>
      {(aria) => (
        <div className="space-y-2">
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <Input
                  value={item}
                  onChange={(e) => update(index, e.target.value)}
                  placeholder={t("pieces.form.list.placeholder")}
                  maxLength={c.maxChars}
                  aria-label={`${field.label} ${index + 1}`}
                  aria-invalid={aria["aria-invalid"]}
                />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={t("pieces.form.list.remove")}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => onChange([...items, ""])}>
              <Plus /> {t("pieces.form.list.add")}
            </Button>
            {c.maxItems && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {t("pieces.form.counters.items", { used: items.length, max: c.maxItems })}
              </span>
            )}
          </div>
        </div>
      )}
    </Field>
  )
}

/* ---------- número ---------- */

function NumberInput({ field, value, onChange, error }: FieldInputProps) {
  const { t } = useTranslation()
  const c = field.constraints ?? {}
  return (
    <Field label={labelOf(field, t)} hint={field.hint} error={error}>
      {(aria) => (
        <Input
          {...aria}
          type="number"
          inputMode="numeric"
          min={c.min}
          max={c.max}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-32"
        />
      )}
    </Field>
  )
}

/* ---------- escolha (fixa ou derivada da paleta) ---------- */

function ChoiceInput({ field, value, onChange, error, brandCore }: FieldInputProps) {
  const { t } = useTranslation()
  const palette = brandCore.publishedDocument?.palette
  const options = useMemo(() => {
    const colors = palette?.colors ?? []
    if (!field.source) return (field.options ?? []).map((o) => ({ id: o.id, label: o.label, swatch: undefined as string | undefined }))
    const pool =
      field.source === "palette.backgrounds"
        ? colors.filter((c) => c.role in BACKGROUND_ROLES)
        : field.source === "palette.accents"
          ? colors.filter((c) => c.role === "accent" || c.role === "campaign")
          : colors
    return pool.map((c) => ({ id: c.id, label: `${c.name} · ${t(`brand.colors.roles.${c.role}`)}`, swatch: c.hex }))
  }, [field, palette, t])

  const items = useMemo(
    () => Object.fromEntries([[NONE, t("pieces.form.choice.none")], ...options.map((o) => [o.id, o.label])]),
    [options, t]
  )
  const current = value ? String(value) : field.required ? null : NONE

  return (
    <Field label={labelOf(field, t)} hint={field.hint} error={error}>
      {(aria) => (
        <Select
          value={current}
          items={items}
          onValueChange={(v) => onChange(v === NONE || v === null ? "" : String(v))}
        >
          <SelectTrigger id={aria.id} aria-invalid={aria["aria-invalid"]} className="w-full sm:w-72">
            <SelectValue placeholder={t("pieces.form.choice.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {!field.required && <SelectItem value={NONE}>{t("pieces.form.choice.none")}</SelectItem>}
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <span className="flex items-center gap-2">
                  {option.swatch && <span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: option.swatch }} aria-hidden />}
                  {option.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  )
}

/* ---------- ref: um fato da operação, nunca digitado ---------- */

function factSummary(fact: BrandFact): string {
  if (fact.kind !== "hours") return fact.value
  const days = Object.values(fact.hours ?? {}).filter(Boolean)
  return days[0] ?? ""
}

function RefInput({ field, value, onChange, error, brandCore }: FieldInputProps) {
  const { t } = useTranslation()
  const facts = (brandCore.publishedDocument?.facts.items ?? []).filter((fact) => field.kinds?.includes(fact.kind))
  const items = useMemo(
    () => Object.fromEntries([[NONE, t("pieces.form.ref.none")], ...facts.map((f) => [f.id, f.label])]),
    [facts, t]
  )
  const selected = facts.find((f) => f.id === value)
  const current = value ? String(value) : field.required ? null : NONE

  return (
    <Field
      label={labelOf(field, t)}
      hint={selected?.status === "pending" ? t("pieces.form.ref.pendingHint") : field.hint}
      error={error}
    >
      {(aria) =>
        facts.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">{t("pieces.form.ref.empty")}</p>
        ) : (
          <Select value={current} items={items} onValueChange={(v) => onChange(v === NONE || v === null ? "" : String(v))}>
            <SelectTrigger id={aria.id} aria-invalid={aria["aria-invalid"]} className="w-full sm:w-96">
              <SelectValue placeholder={t("pieces.form.ref.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {!field.required && <SelectItem value={NONE}>{t("pieces.form.ref.none")}</SelectItem>}
              {facts.map((fact) => (
                <SelectItem key={fact.id} value={fact.id}>
                  <span className="flex w-full items-center gap-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{fact.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{factSummary(fact)}</span>
                    </span>
                    <Badge variant={fact.status === "pending" ? "destructive" : "secondary"} className="ml-auto shrink-0">
                      {t(`pieces.form.ref.status.${fact.status}`)}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
    </Field>
  )
}

/* ---------- imagem: uma foto da marca ---------- */

function ImageInput({ field, value, onChange, error, brandCore }: FieldInputProps) {
  const { t } = useTranslation()
  const kinds = field.kinds ?? ["photo"]
  const photos = brandCore.assets.filter((asset) => kinds.includes(asset.kind))

  return (
    <Field label={labelOf(field, t)} hint={field.hint} error={error}>
      {() => (
        <div className="space-y-2">
          {photos.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">{t("pieces.form.image.empty")}</p>
          ) : (
            <div role="radiogroup" aria-label={t("pieces.form.image.pick")} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {!field.required && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={!value}
                  onClick={() => onChange("")}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center border border-dashed p-2 text-center text-xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    !value && "border-primary ring-2 ring-primary/40"
                  )}
                >
                  {t("pieces.form.image.none")}
                </button>
              )}
              {photos.map((photo) => {
                const selected = value === photo.id
                return (
                  <button
                    key={photo.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={photo.name}
                    onClick={() => onChange(photo.id)}
                    className={cn(
                      "relative aspect-square overflow-hidden border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected && "border-primary ring-2 ring-primary/40"
                    )}
                  >
                    <img src={photo.url} alt="" className="size-full object-cover" />
                    {selected && (
                      <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Field>
  )
}
