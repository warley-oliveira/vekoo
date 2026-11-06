import { useRef, type ReactNode } from "react"
import {
  useWatch,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { useTranslation } from "react-i18next"

import { FormField } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { MESSAGE_TOKENS, MESSAGE_VARIABLES } from "./message-rule"

type VariableTextareaProps<TValues extends FieldValues> = {
  control: Control<TValues, any, any>
  name: FieldPath<TValues>
  label: string
  hint?: ReactNode
  optional?: boolean
  placeholder?: string
  maxLength: number
  /** Mostra quantos caracteres já foram, para limites curtos. */
  showCount?: boolean
  disabled?: boolean
}

/**
 * Campo de mensagem com as variáveis à mão. O botão insere onde o cursor está, e não no fim: quem
 * edita uma frase pronta quase sempre quer a variável no meio dela.
 */
export function VariableTextarea<TValues extends FieldValues>({
  control,
  name,
  label,
  hint,
  optional,
  placeholder,
  maxLength,
  showCount = false,
  disabled,
}: VariableTextareaProps<TValues>) {
  const { t } = useTranslation()
  const language = useLanguage()
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const value = useWatch({ control, name }) as string | null | undefined

  return (
    <FormField
      control={control}
      name={name}
      label={label}
      hint={hint}
      optional={optional}
      disabled={disabled}
      action={
        showCount ? (
          <span className="text-xs leading-none text-muted-foreground tabular-nums">
            {formatNumber(value?.length ?? 0, language)}/{formatNumber(maxLength, language)}
          </span>
        ) : undefined
      }
    >
      {({ field, controlProps }) => {
        const insert = (token: string) => {
          const element = textarea.current
          const text = String(field.value ?? "")
          const start = element?.selectionStart ?? text.length
          const end = element?.selectionEnd ?? text.length
          const next = `${text.slice(0, start)}${token}${text.slice(end)}`

          // Estourar o limite cortaria a mensagem pelo fim: melhor não inserir.
          if (next.length > maxLength) return

          field.onChange(next)
          const caret = start + token.length
          requestAnimationFrame(() => {
            element?.focus()
            element?.setSelectionRange(caret, caret)
          })
        }

        return (
          <div className="space-y-2">
            <Textarea
              {...controlProps}
              name={field.name}
              ref={(node) => {
                textarea.current = node
                field.ref(node)
              }}
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              maxLength={maxLength}
              placeholder={placeholder}
            />
            <div
              role="group"
              aria-label={t("calendar.reminders.variables.group")}
              className="flex flex-wrap items-center gap-1 pointer-coarse:gap-1.5"
            >
              <span className="mr-0.5 text-xs text-muted-foreground">
                {t("calendar.reminders.variables.insert")}
              </span>
              {MESSAGE_VARIABLES.map((variable) => (
                <Button
                  key={variable}
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={disabled}
                  title={t(`calendar.reminders.variables.hints.${variable}`, {
                    token: MESSAGE_TOKENS[variable],
                  })}
                  aria-label={t(`calendar.reminders.variables.hints.${variable}`, {
                    token: MESSAGE_TOKENS[variable],
                  })}
                  className="font-normal"
                  onClick={() => insert(MESSAGE_TOKENS[variable])}
                >
                  {t(`calendar.reminders.variables.labels.${variable}`)}
                </Button>
              ))}
            </div>
          </div>
        )
      }}
    </FormField>
  )
}
