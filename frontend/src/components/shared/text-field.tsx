import type { ComponentProps, ReactNode } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"

import { PasswordInput } from "@/components/form-field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { FormField, type FormFieldBaseProps } from "./form-field"

export type TextFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Omit<
    ComponentProps<"input">,
    "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "form" | "className" | "disabled"
  > & {
    /** Texto ou ícone dentro do campo, à esquerda ("https://"). */
    startAdornment?: ReactNode
    endAdornment?: ReactNode
    inputClassName?: string
  }

/** Campo de texto. `type="password"` já traz o botão de mostrar a senha. */
export function TextField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  control,
  name,
  label,
  hint,
  action,
  optional,
  disabled,
  className,
  startAdornment,
  endAdornment,
  inputClassName,
  type = "text",
  ...inputProps
}: TextFieldProps<TValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      label={label}
      hint={hint}
      action={action}
      optional={optional}
      disabled={disabled}
      className={className}
    >
      {({ field, controlProps }) => {
        const props = {
          ...inputProps,
          ...controlProps,
          name: field.name,
          ref: field.ref,
          value: field.value ?? "",
          onChange: field.onChange,
          onBlur: field.onBlur,
          type,
          className: inputClassName,
        }

        if (type === "password") return <PasswordInput {...props} />

        if (startAdornment || endAdornment) {
          return (
            <InputGroup>
              <InputGroupInput {...props} />
              {startAdornment ? (
                <InputGroupAddon align="inline-start">{startAdornment}</InputGroupAddon>
              ) : null}
              {endAdornment ? (
                <InputGroupAddon align="inline-end">{endAdornment}</InputGroupAddon>
              ) : null}
            </InputGroup>
          )
        }

        return <Input {...props} />
      }}
    </FormField>
  )
}
