import type { ReactNode } from "react"
import {
  useFormContext,
  useFormState,
  type Control,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type FormActionsProps = {
  /** Verbo da ação: "Salvar alterações", "Criar contato". */
  submitLabel: string
  onCancel?: () => void
  cancelLabel?: string
  /** O formulário, quando não há `<Form>` em volta (dentro de `SidePanel` e `ResponsiveDialog`). */
  form?: UseFormReturn<any, any, any>
  /** Ação à esquerda, como "Excluir". */
  secondary?: ReactNode
  /** Só libera o envio depois de alguma alteração. */
  requireChanges?: boolean
  /** Sem react-hook-form: o estado de envio vem daqui. */
  loading?: boolean
  disabled?: boolean
  className?: string
}

/** Mostra o erro geral do formulário, o que não pertence a nenhum campo. */
export function FormError({
  form,
  className,
}: {
  form?: UseFormReturn<any, any, any>
  className?: string
}) {
  const context = useFormContext()
  const control = form?.control ?? context?.control
  return control ? <ConnectedFormError control={control} className={className} /> : null
}

function ConnectedFormError({
  control,
  className,
}: {
  control: Control<FieldValues, any, any>
  className?: string
}) {
  const { errors } = useFormState({ control })
  const message = errors.root?.message

  if (!message) return null

  return (
    <p role="alert" className={cn("text-sm text-destructive", className)}>
      {String(message)}
    </p>
  )
}

/**
 * Rodapé de formulário: envio com "carregando", sem clique duplo, e o erro geral logo
 * acima dos botões, onde a pessoa está olhando.
 */
export function FormActions({ form, ...props }: FormActionsProps) {
  const context = useFormContext()
  const control = form?.control ?? context?.control

  return control ? (
    <ConnectedFormActions control={control} {...props} />
  ) : (
    <FormActionsView {...props} />
  )
}

function ConnectedFormActions({
  control,
  requireChanges,
  disabled,
  loading,
  ...props
}: Omit<FormActionsProps, "form"> & { control: Control<FieldValues, any, any> }) {
  const { isSubmitting, isDirty, errors } = useFormState({ control })

  return (
    <FormActionsView
      {...props}
      loading={loading || isSubmitting}
      disabled={disabled || (requireChanges && !isDirty)}
      error={errors.root?.message ? String(errors.root.message) : undefined}
    />
  )
}

function FormActionsView({
  submitLabel,
  onCancel,
  cancelLabel,
  secondary,
  loading = false,
  disabled = false,
  error,
  className,
}: Omit<FormActionsProps, "form" | "requireChanges"> & { error?: string }) {
  const { t } = useTranslation()

  return (
    <div data-slot="form-actions" className={cn("flex w-full flex-col gap-3", className)}>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:text-right">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {secondary ? <div className="sm:mr-auto">{secondary}</div> : null}
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={onCancel}
            className="pointer-coarse:h-10"
          >
            {cancelLabel ?? t("kit.actions.cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          // Sem `disabled` durante o envio: o foco se perderia ao terminar, e quem usa
          // teclado voltaria para o topo da página. O clique repetido morre aqui.
          disabled={disabled}
          aria-busy={loading}
          onClick={(event) => {
            if (loading) event.preventDefault()
          }}
          className={cn("pointer-coarse:h-10", loading && "pointer-events-none opacity-80")}
        >
          {loading ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
