import { useId, type ReactNode } from "react"
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export type CheckboxFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = {
  control?: Control<TValues, any, any>
  name: TName
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
  className?: string
}

/** Aceite ou opção que só vale ao enviar. O rótulo inteiro responde ao clique. */
export function CheckboxField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({ control, name, label, hint, disabled, className }: CheckboxFieldProps<TValues, TName>) {
  const { field, fieldState } = useController({ control, name })
  const messageId = useId()
  const error = fieldState.error?.message
  const message = error ?? hint

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 pointer-coarse:min-h-10",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <Checkbox
        ref={field.ref}
        name={field.name}
        checked={Boolean(field.value)}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={message ? messageId : undefined}
        onCheckedChange={(checked) => field.onChange(checked)}
        onBlur={field.onBlur}
        className="mt-px border-muted-foreground/40"
      />
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm leading-snug">{label}</span>
        {message ? (
          <span
            id={messageId}
            role={error ? "alert" : undefined}
            className={cn(
              "block text-xs leading-snug",
              error ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {message}
          </span>
        ) : null}
      </span>
    </label>
  )
}
