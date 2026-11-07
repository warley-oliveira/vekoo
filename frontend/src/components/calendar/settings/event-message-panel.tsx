import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { z } from "zod"

import {
  FormActions,
  ResponsiveDialog,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { useGuardedClose } from "@/hooks/use-panel-session"
import type { ProfessionalEventRule } from "@/lib/calendar/types"
import { NOTICE_MESSAGE_MAX } from "./collaborator-reminder-panel"
import { VariableTextarea } from "./variable-textarea"

function buildSchema(t: TFunction) {
  return z.object({
    message: z
      .string()
      .trim()
      .max(NOTICE_MESSAGE_MAX, t("calendar.settings.notices.messageTooLong", { max: NOTICE_MESSAGE_MAX })),
  })
}

type EventMessageValues = z.infer<ReturnType<typeof buildSchema>>

type EventMessagePanelProps = {
  rule: ProfessionalEventRule
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` volta ao texto padrão. */
  onSave: (message: string | null) => Promise<unknown>
}

/** O texto do aviso de WhatsApp de um evento. Em branco, vale o padrão que a API já conhece. */
export function EventMessagePanel({ rule, open, onOpenChange, onSave }: EventMessagePanelProps) {
  const { t } = useTranslation()

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<EventMessageValues>({
    resolver: zodResolver(schema),
    defaultValues: { message: rule.message ?? "" },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)
  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const submit = useFormSubmit(form, async (values) => {
    await onSave(values.message || null)
    form.reset(values)
    close()
  })

  return (
    <ResponsiveDialog
      size="lg"
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={t(`calendar.settings.notices.events.${rule.event}.title`)}
      description={t(`calendar.settings.notices.events.${rule.event}.description`)}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("calendar.settings.notices.eventMessage.submit")}
          onCancel={close}
          requireChanges
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />
      <VariableTextarea
        control={form.control}
        name="message"
        label={t("calendar.settings.notices.eventMessage.label")}
        hint={t("calendar.settings.notices.eventMessage.hint")}
        maxLength={NOTICE_MESSAGE_MAX}
        showCount
      />
    </ResponsiveDialog>
  )
}
