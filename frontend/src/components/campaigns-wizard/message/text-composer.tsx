import { memo } from "react"
import { useController, useFieldArray, useFormContext, useFormState, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { Plus, Trash2, TriangleAlert } from "lucide-react"

import { Callout } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useRecipientSummary } from "@/hooks/campaigns-wizard/use-campaign-options"
import { useDraft } from "@/hooks/campaigns-wizard/use-draft"
import type { RecipientVariable } from "@/lib/campaigns-wizard/types"
import type { WizardValues } from "@/lib/campaigns-wizard/form"
import { asToken, variableProblems } from "@/lib/campaigns-wizard/variables"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { VariableField } from "../variable-field"

const MAX_VARIATIONS = 10

/** Cada variação assina só o próprio campo: digitar numa não redesenha as outras, nem a tela. */
const VariationField = memo(function VariationField({
  index,
  count,
  onRemove,
  variables,
  label,
  placeholder,
}: {
  index: number
  count: number
  onRemove: () => void
  variables: RecipientVariable[]
  label: string
  placeholder: string
}) {
  const { t } = useTranslation()
  const { control } = useFormContext<WizardValues>()
  const { field } = useController({ control, name: `messages.${index}.text` })

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <label htmlFor={`variation-${index}`} className="text-sm font-medium">
          {label}
        </label>
        {count > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground pointer-coarse:size-10"
            aria-label={t("campaignsWizard.message.removeVariation", { number: index + 1 })}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
      <VariableField
        id={`variation-${index}`}
        multiline
        value={field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
        inputRef={field.ref}
        variables={variables}
        placeholder={placeholder}
      />
    </div>
  )
})

/** O aviso de variável inexistente, enquanto a pessoa ainda pode corrigir. */
function VariableWarnings({ variables, total }: { variables: RecipientVariable[]; total: number }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { control } = useFormContext<WizardValues>()
  const messages = useWatch({ control, name: "messages" })
  const problems = variableProblems(
    messages.map((message) => message.text),
    variables,
    total
  )

  if (problems.length === 0) return null

  return (
    <Callout tone="warning" icon={<TriangleAlert />} role="status">
      <ul className="flex flex-col gap-0.5">
        {problems.map((problem) => (
          <li key={problem.token}>
            {problem.count > 0
              ? t("campaignsWizard.message.variablePartial", {
                  token: asToken(problem.token),
                  count: formatNumber(problem.count, language),
                  total: formatNumber(total, language),
                })
              : t("campaignsWizard.message.variableMissing", { token: asToken(problem.token) })}
          </li>
        ))}
      </ul>
    </Callout>
  )
}

function MessagesError() {
  const { errors } = useFormState<WizardValues>({ name: "messages" })
  const error = errors.messages as { message?: string; root?: { message?: string } } | undefined
  const message = error?.root?.message ?? error?.message
  if (!message) return null

  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

/** As mensagens, ou as legendas de uma mídia. Mais de uma é rodízio: cada pessoa recebe uma. */
export function TextComposer({ caption = false }: { caption?: boolean }) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const { control } = useFormContext<WizardValues>()
  const { campaignId } = useDraft()
  const { summary } = useRecipientSummary(campaignId)
  const { fields, append, remove } = useFieldArray({ control, name: "messages" })

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {fields.map((field, index) => (
          <motion.div key={field.id} {...preset.listItem}>
            <VariationField
              index={index}
              count={fields.length}
              onRemove={() => remove(index)}
              variables={summary.variables}
              label={
                caption
                  ? fields.length > 1
                    ? t("campaignsWizard.message.captionNumber", { number: index + 1 })
                    : t("campaignsWizard.message.caption")
                  : fields.length > 1
                    ? t("campaignsWizard.message.variationNumber", { number: index + 1 })
                    : t("campaignsWizard.message.yourMessage")
              }
              placeholder={
                index > 0
                  ? t("campaignsWizard.message.variationPlaceholder")
                  : caption
                    ? t("campaignsWizard.message.captionPlaceholder")
                    : t("campaignsWizard.message.placeholder", { token: asToken("nome") })
              }
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <MessagesError />

      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 pointer-coarse:h-10"
          disabled={fields.length >= MAX_VARIATIONS}
          onClick={() => append({ text: "" })}
        >
          <Plus />
          {t("campaignsWizard.message.addVariation")}
        </Button>
        <p className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.message.variationHint")}</p>
      </div>

      <VariableWarnings variables={summary.variables} total={summary.total} />
    </div>
  )
}
