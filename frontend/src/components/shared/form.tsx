import type { ComponentProps } from "react"
import { FormProvider, type FieldValues, type UseFormReturn } from "react-hook-form"

import { useFormSubmit } from "./use-form-submit"

export type FormProps<
  TValues extends FieldValues,
  TContext,
  TTransformed extends FieldValues,
> = Omit<ComponentProps<"form">, "onSubmit"> & {
  form: UseFormReturn<TValues, TContext, TTransformed>
  onSubmit: (values: TTransformed) => void | Promise<unknown>
}

/**
 * Formulário em página. Dá contexto ao `FormActions` e usa `useFormSubmit`. Dentro de
 * `SidePanel` e `ResponsiveDialog`, use o `onSubmit` deles: o conteúdo vai para um
 * portal e o botão não estaria dentro deste `<form>`.
 */
export function Form<
  TValues extends FieldValues,
  TContext,
  TTransformed extends FieldValues,
>({ form, onSubmit, className, children, ...props }: FormProps<TValues, TContext, TTransformed>) {
  const submit = useFormSubmit(form, onSubmit)

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={submit} className={className} {...props}>
        {children}
      </form>
    </FormProvider>
  )
}
