import { useRef } from "react"
import type { FieldValues, UseFormReturn } from "react-hook-form"

import { applyServerErrors } from "./apply-server-errors"

/**
 * O envio de todo formulário: valida, ignora o segundo clique ou Enter enquanto o
 * primeiro roda, e joga o erro do servidor nos campos. A tela só escreve o caminho
 * feliz, sem `try/catch`.
 *
 * ```ts
 * const submit = useFormSubmit(form, async (values) => {
 *   await apiPost("/contacts", values)
 *   toast.success(t("contacts.created"))
 * })
 * <SidePanel onSubmit={submit} …>
 * ```
 */
export function useFormSubmit<TValues extends FieldValues, TContext, TTransformed extends FieldValues>(
  form: UseFormReturn<TValues, TContext, TTransformed>,
  onSubmit: (values: TTransformed) => void | Promise<unknown>
) {
  const inFlight = useRef(false)

  return form.handleSubmit(async (values) => {
    if (inFlight.current) return

    inFlight.current = true
    try {
      await onSubmit(values)
    } catch (error) {
      applyServerErrors(error, form.setError)
    } finally {
      inFlight.current = false
    }
  })
}
