import { useId, type ReactNode } from "react"
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import type { SelectOption } from "./select-field"

export type RadioFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = {
  control?: Control<TValues, any, any>
  name: TName
  label: string
  hint?: ReactNode
  options: SelectOption[]
  /** `cards`: cada opção vira um cartão, para quando a descrição pesa na escolha. */
  variant?: "default" | "cards"
  orientation?: "vertical" | "horizontal"
  disabled?: boolean
  className?: string
}

/** Escolher uma entre poucas opções, todas à vista. Até umas 5; depois disso, `SelectField`. */
export function RadioField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  control,
  name,
  label,
  hint,
  options,
  variant = "default",
  orientation = "vertical",
  disabled,
  className,
}: RadioFieldProps<TValues, TName>) {
  const { field, fieldState } = useController({ control, name })
  const labelId = useId()
  const messageId = useId()
  const error = fieldState.error?.message
  const message = error ?? hint

  return (
    <div className={cn("space-y-2", className)}>
      <span id={labelId} className="block text-sm leading-none font-medium">
        {label}
      </span>
      <RadioGroup
        name={field.name}
        value={field.value ?? null}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={message ? messageId : undefined}
        aria-invalid={Boolean(error) || undefined}
        onValueChange={(value) => field.onChange(value)}
        onBlur={field.onBlur}
        className={cn(
          orientation === "horizontal" && "flex flex-wrap gap-x-4 gap-y-2",
          variant === "cards" && orientation === "horizontal" && "grid sm:grid-cols-2"
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2.5",
              option.disabled && "cursor-not-allowed opacity-60",
              variant === "default" && "min-h-10 md:min-h-0",
              variant === "cards" &&
                "rounded-lg border p-3 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-accent/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            )}
          >
            <RadioGroupItem value={option.value} disabled={option.disabled} className="mt-px" />
            <span className="min-w-0 space-y-0.5">
              <span className="flex items-center gap-1.5 text-sm leading-snug [&>svg]:size-4 [&>svg]:shrink-0">
                {option.icon}
                {option.label}
              </span>
              {option.description ? (
                <span className="block text-xs leading-snug text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </RadioGroup>
      {message ? (
        <p
          id={messageId}
          role={error ? "alert" : undefined}
          className={cn(
            "text-xs leading-snug",
            error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
