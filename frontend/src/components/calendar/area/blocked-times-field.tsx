import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { Plus, Trash2 } from "lucide-react"

import { DateTimePicker, Field, StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { fieldDateOf } from "@/lib/calendar/timezone"
import type { BlockedTime } from "@/lib/calendar/types"
import { useMotionPreset } from "@/lib/motion"
import { blockedProblem, formatWall, newBlock, parseWall, withStart } from "./blocked-times"

type BlockedTimesFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> = {
  control: Control<TValues, any, any>
  name: TName
  timeZone: string
}

/** Os bloqueios pontuais de um colaborador: férias, consulta, um dia que ele não vem. */
export function BlockedTimesField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  timeZone,
}: BlockedTimesFieldProps<TValues, TName>) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const { field, fieldState } = useController({ control, name })
  const blocks = field.value as BlockedTime[]
  const serverError = fieldState.error?.type === "server" ? fieldState.error.message : undefined

  const now = formatWall(fieldDateOf(Date.now(), timeZone))

  const update = (index: number, next: BlockedTime) =>
    field.onChange(blocks.map((block, position) => (position === index ? next : block)))

  return (
    <div ref={field.ref} tabIndex={-1} className="flex flex-col gap-3 rounded-lg outline-none">
      {serverError ? (
        <p role="alert" className="text-xs leading-snug text-destructive">
          {t("calendar.collaborators.blocks.errors.server", { message: serverError })}
        </p>
      ) : null}

      {blocks.length > 0 ? (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false} mode="popLayout">
            {blocks.map((block, index) => {
              const problem = blockedProblem(block)
              const past = !problem && block.end < now
              return (
                <motion.li
                  key={index}
                  {...preset.listItem}
                  className="grid gap-3 rounded-lg p-3 ring-1 ring-foreground/10 sm:grid-cols-2"
                >
                  <Field
                    label={t("calendar.collaborators.blocks.start")}
                    action={
                      past ? (
                        <StatusBadge tone="neutral" dot={false}>
                          {t("calendar.collaborators.blocks.past")}
                        </StatusBadge>
                      ) : undefined
                    }
                  >
                    {(controlProps) => (
                      <DateTimePicker
                        {...controlProps}
                        label={t("calendar.collaborators.blocks.start")}
                        value={parseWall(block.start)}
                        defaultTime="09:00"
                        onChange={(next) => {
                          if (next) update(index, withStart(block, next))
                        }}
                      />
                    )}
                  </Field>
                  <Field
                    label={t("calendar.collaborators.blocks.end")}
                    error={
                      problem ? t(`calendar.collaborators.blocks.errors.${problem}`) : undefined
                    }
                    action={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("calendar.collaborators.blocks.remove")}
                        className="-my-1 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          field.onChange(blocks.filter((_, position) => position !== index))
                        }
                      >
                        <Trash2 />
                      </Button>
                    }
                  >
                    {(controlProps) => (
                      <DateTimePicker
                        {...controlProps}
                        label={t("calendar.collaborators.blocks.end")}
                        value={parseWall(block.end)}
                        defaultTime="18:00"
                        onChange={(next) => {
                          if (next) update(index, { ...block, end: formatWall(next) })
                        }}
                      />
                    )}
                  </Field>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("calendar.collaborators.blocks.empty")}</p>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:h-10"
          onClick={() => field.onChange([...blocks, newBlock(timeZone)])}
        >
          <Plus />
          {t("calendar.collaborators.blocks.add")}
        </Button>
      </div>
    </div>
  )
}
