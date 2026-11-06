import { useId, type ReactNode } from "react"
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export type SwitchFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = {
  control?: Control<TValues, any, any>
  name: TName
  label: string
  hint?: ReactNode
  disabled?: boolean
  className?: string
}

/** Liga e desliga algo que vale na hora ou ao salvar. A linha inteira responde ao toque. */
export function SwitchField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({ control, name, label, hint, disabled, className }: SwitchFieldProps<TValues, TName>) {
  const { field, fieldState } = useController({ control, name })
  const messageId = useId()
  const error = fieldState.error?.message
  const message = error ?? hint

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        className={cn(
          "flex min-h-10 cursor-pointer items-center justify-between gap-4 md:min-h-0",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm leading-snug font-medium">{label}</span>
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
        <Switch
          ref={field.ref}
          name={field.name}
          checked={Boolean(field.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={message ? messageId : undefined}
          onCheckedChange={(checked) => field.onChange(checked)}
          onBlur={field.onBlur}
        />
      </label>
    </div>
  )
}
