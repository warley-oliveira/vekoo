import { useMemo, useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { FieldInput } from "@/components/pieces/field-inputs"
import { PiecePreview } from "@/components/pieces/piece-preview"
import { Field } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { usePieceMutations } from "@/hooks/use-pieces"
import { ApiError } from "@/lib/api"
import type { BrandCore } from "@/lib/brand-core"
import {
  compactValues,
  defaultValues,
  pieceHref,
  validateValues,
  type EngineManifest,
  type PieceFormat,
  type PieceValues,
} from "@/lib/engines"

type PieceFormProps = { engine: EngineManifest; brandCore: BrandCore }

/**
 * O formulário de criar peça, gerado do manifesto: um `FieldInput` por
 * campo, formato, nome e a prévia ao lado. Valida no cliente com as mesmas
 * regras do servidor e, se o servidor ainda assim recusar, põe o erro no
 * campo certo (`values.<id>`).
 */
export function PieceForm({ engine, brandCore }: PieceFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { create } = usePieceMutations(brandCore.id)
  const [values, setValues] = useState<PieceValues>(() => defaultValues(engine))
  const [format, setFormat] = useState<PieceFormat>(engine.formats[0])
  const [title, setTitle] = useState("")
  const [touched, setTouched] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const clientErrors = useMemo(() => validateValues(engine, values), [engine, values])
  const formatLabels = useMemo(
    () => Object.fromEntries(engine.formats.map((f) => [f, t(`pieces.catalog.formats.${f}`)])),
    [engine.formats, t]
  )

  function errorFor(fieldId: string): string | undefined {
    if (serverErrors[fieldId]) return serverErrors[fieldId]
    if (!touched) return undefined
    const code = clientErrors[fieldId]
    return code ? t(`pieces.form.validation.${code}`) : undefined
  }

  function update(fieldId: string, value: PieceValues[string]) {
    setValues((current) => ({ ...current, [fieldId]: value }))
    setServerErrors((current) => {
      if (!current[fieldId]) return current
      const next = { ...current }
      delete next[fieldId]
      return next
    })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (Object.keys(clientErrors).length > 0) return

    setSubmitting(true)
    try {
      const piece = await create({ engineId: engine.id, format, title: title.trim() || undefined, values: compactValues(values) })
      toast(t("pieces.form.createdToast"))
      navigate(pieceHref(brandCore.id, piece.id))
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        const mapped: Record<string, string> = {}
        for (const [path, messages] of Object.entries(error.details)) {
          if (path.startsWith("values.") && messages[0]) mapped[path.slice(7)] = messages[0]
        }
        setServerErrors(mapped)
        if (Object.keys(mapped).length === 0) toast.error(error.serverMessage ?? t("pieces.form.createFailed"))
      } else {
        toast.error(t("pieces.form.createFailed"))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5">
        {engine.formats.length > 1 && (
          <div className="space-y-1.5">
            <span className="text-sm font-medium">{t("pieces.form.format")}</span>
            <ToggleGroup
              value={[format]}
              onValueChange={(value) => {
                const next = value[0] as PieceFormat | undefined
                if (next) setFormat(next)
              }}
              variant="outline"
              spacing={0}
              aria-label={t("pieces.form.format")}
            >
              {engine.formats.map((f) => (
                <ToggleGroupItem key={f} value={f}>{formatLabels[f]}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}

        {engine.fields.map((field) => (
          <FieldInput
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(value) => update(field.id, value)}
            error={errorFor(field.id)}
            brandCore={brandCore}
          />
        ))}

        <Field label={t("pieces.form.title")}>
          {(aria) => (
            <Input {...aria} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("pieces.form.titlePlaceholder")} maxLength={120} />
          )}
        </Field>

        <div className="flex justify-end border-t pt-5">
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {submitting ? t("pieces.form.creating") : t("pieces.form.create")}
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <PiecePreview brandId={brandCore.id} engine={engine} values={values} format={format} />
      </div>
    </form>
  )
}
