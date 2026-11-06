import { useState } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  FormField,
  ResponsivePopover,
  type FormFieldBaseProps,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { BOARD_ICON_NAMES, BOARD_ICONS, boardIcon } from "@/lib/pipelines-admin/board-icons"
import { getReadableTextColor, isHexColor } from "@/lib/tag-color"
import { cn } from "@/lib/utils"

const SIZES = {
  md: "size-10 rounded-lg [&>svg]:size-5",
  lg: "size-12 rounded-xl [&>svg]:size-6",
} as const

/** O ícone do quadro sobre a cor que a pessoa escolheu, com contraste calculado. */
export function BoardIconTile({
  icon,
  color,
  size = "lg",
  className,
}: {
  icon: string | null | undefined
  color: string | null | undefined
  size?: keyof typeof SIZES
  className?: string
}) {
  const Icon = boardIcon(icon)
  const hasColor = Boolean(color && isHexColor(color))

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        SIZES[size],
        !hasColor && "bg-muted text-muted-foreground",
        className
      )}
      style={
        hasColor
          ? { backgroundColor: color!, color: getReadableTextColor(color!) }
          : undefined
      }
    >
      <Icon />
    </span>
  )
}

/** Escolher o ícone do quadro: a grade inteira à vista, com o nome para quem usa leitor de tela. */
export function BoardIconField<TValues extends FieldValues, TName extends FieldPath<TValues>>(
  props: FormFieldBaseProps<TValues, TName>
) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <FormField {...props}>
      {({ field, controlProps }) => {
        const Current = boardIcon(field.value)
        return (
          <ResponsivePopover
            open={open}
            onOpenChange={(next) => {
              setOpen(next)
              if (!next) field.onBlur()
            }}
            title={props.label}
            className="w-72 p-2"
            trigger={
              <Button
                {...controlProps}
                ref={field.ref}
                type="button"
                variant="outline"
                className="w-full justify-start px-2.5 font-normal pointer-coarse:h-10"
              >
                <Current className="text-muted-foreground" />
                <span className="truncate">
                  {t(`pipelinesAdmin.icons.${field.value && BOARD_ICONS[field.value] ? field.value : "kanban"}`)}
                </span>
              </Button>
            }
          >
            <div role="group" aria-label={props.label} className="grid grid-cols-6 gap-1 md:grid-cols-6">
              {BOARD_ICON_NAMES.map((name) => {
                const Icon = BOARD_ICONS[name]
                const selected = (field.value || "kanban") === name
                return (
                  <Button
                    key={name}
                    type="button"
                    variant={selected ? "secondary" : "ghost"}
                    size="icon"
                    aria-pressed={selected}
                    aria-label={t(`pipelinesAdmin.icons.${name}`)}
                    title={t(`pipelinesAdmin.icons.${name}`)}
                    className={cn(
                      "size-10 w-full",
                      selected && "text-primary ring-1 ring-primary/40"
                    )}
                    onClick={() => {
                      field.onChange(name)
                      setOpen(false)
                    }}
                  >
                    <Icon />
                  </Button>
                )
              })}
            </div>
          </ResponsivePopover>
        )
      }}
    </FormField>
  )
}
