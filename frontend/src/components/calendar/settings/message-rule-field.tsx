import {
  useWatch,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { useTranslation } from "react-i18next"
import { AlertTriangle, FlaskConical, PenLine, Sparkles, Wrench } from "lucide-react"

import { Callout, RadioField } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { MESSAGE_MAX, MESSAGE_TOKENS, type MessageKind, type MessageMode } from "./message-rule"
import { VariableTextarea } from "./variable-textarea"

type MessageRuleFieldProps<TValues extends FieldValues> = {
  control: Control<TValues, any, any>
  /** Onde os três campos moram no formulário: "" na raiz, `steps.0.` num passo. */
  prefix?: string
  kind: MessageKind
  /** Testa o que está na tela, sem precisar salvar. */
  onTest: () => void
  /** Só no passo: a IA de um lembrete não tem ferramentas. */
  onShowTools?: () => void
}

/**
 * Como uma mensagem é escrita: o mesmo componente no lembrete e no passo de sequência. O preço fica
 * na própria opção, antes da escolha, e o que acontece quando a IA falha fica à vista enquanto a
 * pessoa decide se vale escrever o texto reserva.
 */
export function MessageRuleField<TValues extends FieldValues>({
  control,
  prefix = "",
  kind,
  onTest,
  onShowTools,
}: MessageRuleFieldProps<TValues>) {
  const { t } = useTranslation()

  const name = (field: string) => `${prefix}${field}` as FieldPath<TValues>
  const mode = useWatch({ control, name: name("mode") }) as MessageMode
  const message = (useWatch({ control, name: name("message") }) ?? "") as string
  const aiPrompt = (useWatch({ control, name: name("aiPrompt") }) ?? "") as string

  const usesAi = mode === "ai"
  const hasFallback = Boolean(message.trim())
  const canTest = Boolean((usesAi ? aiPrompt : message).trim())

  return (
    <div className="flex flex-col gap-4">
      <RadioField
        control={control}
        name={name("mode")}
        label={t("calendar.reminders.rule.mode")}
        variant="cards"
        orientation="horizontal"
        options={[
          {
            value: "text",
            label: t("calendar.reminders.rule.modes.text.label"),
            description: t("calendar.reminders.rule.modes.text.description"),
            icon: <PenLine />,
          },
          {
            value: "ai",
            label: t("calendar.reminders.rule.modes.ai.label"),
            description: t("calendar.reminders.rule.modes.ai.description"),
            icon: <Sparkles />,
          },
        ]}
      />

      {usesAi ? (
        <>
          <VariableTextarea
            control={control}
            name={name("aiPrompt")}
            label={t("calendar.reminders.rule.aiPrompt")}
            hint={t(`calendar.reminders.rule.aiPromptHint.${kind}`)}
            placeholder={t(`calendar.reminders.rule.aiPromptPlaceholder.${kind}`, MESSAGE_TOKENS)}
            maxLength={MESSAGE_MAX}
          />
          <VariableTextarea
            control={control}
            name={name("message")}
            label={t("calendar.reminders.rule.fallback")}
            placeholder={t(`calendar.reminders.rule.fallbackPlaceholder.${kind}`, MESSAGE_TOKENS)}
            maxLength={MESSAGE_MAX}
            optional
          />
          <Callout
            tone={kind === "step" && !hasFallback ? "warning" : "neutral"}
            icon={kind === "step" && !hasFallback ? <AlertTriangle /> : undefined}
          >
            {t(
              hasFallback
                ? "calendar.reminders.rule.ifAiFails.withFallback"
                : `calendar.reminders.rule.ifAiFails.${kind}`
            )}
          </Callout>
        </>
      ) : (
        <VariableTextarea
          control={control}
          name={name("message")}
          label={t("calendar.reminders.rule.message")}
          hint={t("calendar.reminders.rule.messageHint")}
          placeholder={t(`calendar.reminders.rule.messagePlaceholder.${kind}`, MESSAGE_TOKENS)}
          maxLength={MESSAGE_MAX}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canTest}
          className="pointer-coarse:h-10"
          onClick={onTest}
        >
          <FlaskConical />
          {t(`calendar.reminders.test.trigger.${kind}`)}
        </Button>
        {usesAi && onShowTools ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:h-10"
            onClick={onShowTools}
          >
            <Wrench />
            {t("calendar.sequences.tools.trigger")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
