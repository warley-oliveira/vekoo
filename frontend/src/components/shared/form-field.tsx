import type { ReactNode } from "react"
import {
  useController,
  type Control,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Field } from "@/components/form-field"

/** Props que todo campo do kit aceita. */
export type FormFieldBaseProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = {
  /** `form.control`. Opcional dentro de `<Form>`, mas passar faz o TS checar `name`. */
  control?: Control<TValues, any, any>
  name: TName
  label: string
  /** Texto de apoio. Some enquanto houver erro. */
  hint?: ReactNode
  /** Link ou ação alinhada à direita do rótulo. */
  action?: ReactNode
  /** Mostra "opcional" ao lado do rótulo. É melhor marcar a exceção do que encher de asterisco. */
  optional?: boolean
  disabled?: boolean
  className?: string
}

/** O que o controle precisa receber para ficar ligado ao rótulo e à mensagem. */
export type FieldControlProps = {
  id: string
  "aria-invalid": boolean
  "aria-describedby": string | undefined
  disabled?: boolean
}

export type FormFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> & {
  children: (props: {
    field: ControllerRenderProps<TValues, TName>
    fieldState: ControllerFieldState
    controlProps: FieldControlProps
  }) => ReactNode
}

/**
 * Liga um controle qualquer ao react-hook-form: rótulo, valor, erro e ARIA. Para os
 * casos comuns já existem os campos prontos (`TextField`, `SelectField`…); use este
 * quando o controle for próprio da tela.
 */
export function FormField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  control,
  name,
  label,
  hint,
  action,
  optional = false,
  disabled,
  className,
  children,
}: FormFieldProps<TValues, TName>) {
  const { t } = useTranslation()
  const { field, fieldState } = useController({ control, name })

  return (
    <Field
      label={label}
      hint={hint}
      error={fieldState.error?.message}
      className={className}
      action={
        optional || action ? (
          <span className="flex items-baseline gap-2 leading-none">
            {optional ? (
              <span className="text-xs leading-none text-muted-foreground">
                {t("kit.form.optional")}
              </span>
            ) : null}
            {action}
          </span>
        ) : undefined
      }
    >
      {(fieldProps) =>
        children({ field, fieldState, controlProps: { ...fieldProps, disabled } })
      }
    </Field>
  )
}
