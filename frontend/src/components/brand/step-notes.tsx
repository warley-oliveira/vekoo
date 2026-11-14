import { useMemo } from "react"
import { useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { NotebookPen } from "lucide-react"

import { useRegisterStep, useWizard } from "@/components/brand/brand-wizard-context"
import { useStepForm } from "@/components/brand/use-step-form"
import { Field } from "@/components/form-field"
import { Textarea } from "@/components/ui/textarea"
import { buildStepSchemas } from "@/lib/brand-core"
import { cn } from "@/lib/utils"

const MAX = 2000

/**
 * Anotações da operação: preço, horário, promoção — texto livre e opcional.
 *
 * Era uma lista de fatos com status, e um fato pendente barrava a geração.
 * O portão saiu: o que a peça mostra é o que a pessoa escreve no formulário
 * da peça. Aqui ficou o que sempre foi útil — a marca com as informações à
 * mão, num lugar só.
 */
export function StepNotes() {
  const { t } = useTranslation()
  const { brandCore, previewSection } = useWizard()
  const schema = useMemo(() => buildStepSchemas(t).notes, [t])
  const { form, status, commit, retry } = useStepForm({
    section: "notes",
    defaults: brandCore.document.notes,
    schema,
    onChange: (values) => previewSection("notes", values),
  })
  useRegisterStep(commit, status, retry)

  const { register, control, formState: { errors } } = form
  const text = (useWatch({ control, name: "text" }) ?? "") as string

  return (
    <form noValidate className="space-y-5" onSubmit={(e) => e.preventDefault()}>
      <p className="text-sm text-muted-foreground">{t("brand.notes.intro")}</p>

      <Field label={t("brand.notes.label")} hint={t("brand.notes.hint")} error={errors.text?.message}>
        {(field) => (
          <div className="space-y-1">
            <Textarea
              {...field}
              {...register("text")}
              rows={10}
              maxLength={MAX}
              autoFocus
              placeholder={t("brand.notes.placeholder")}
              className="font-mono text-sm leading-relaxed"
            />
            <p
              className={cn(
                "text-right text-[11px] tabular-nums",
                text.length > MAX ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {t("brand.notes.counter", { used: text.length, max: MAX })}
            </p>
          </div>
        )}
      </Field>

      <aside className="flex gap-3 rounded-lg border p-4 text-sm" aria-label={t("brand.notes.asideTitle")}>
        <NotebookPen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{t("brand.notes.asideTitle")}</p>
          <p className="text-muted-foreground">{t("brand.notes.asideBody")}</p>
        </div>
      </aside>
    </form>
  )
}
