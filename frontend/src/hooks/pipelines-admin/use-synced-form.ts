import { useEffect } from "react"
import type { FieldValues, UseFormReturn } from "react-hook-form"

/**
 * Outra pessoa mudou enquanto a tela estava aberta, ou o salvamento acabou de voltar: o formulário
 * acompanha o que veio do servidor, sem atropelar o que está sendo digitado.
 */
export function useSyncedForm<TValues extends FieldValues, TContext, TTransformed extends FieldValues>(
  form: UseFormReturn<TValues, TContext, TTransformed>,
  values: TValues
) {
  const serialized = JSON.stringify(values)
  const isDirty = form.formState.isDirty

  useEffect(() => {
    if (!isDirty) form.reset(JSON.parse(serialized) as TValues)
  }, [form, isDirty, serialized])
}
