import { useMemo, type JSX } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { GraduationCap, Users } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ColorField,
  ComboboxField,
  FormActions,
  RadioField,
  SidePanel,
  TextField,
  TextareaField,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { useCalendarMutations } from "@/hooks/calendar/use-calendars"
import { useOrganization } from "@/hooks/people/use-organization"
import { useGuardedClose, useOpenCount } from "@/hooks/use-panel-session"
import type { AgendaCalendar } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { timezoneOptions } from "@/lib/people/timezones"
import { COLOR_SWATCHES } from "@/lib/tag-color"

const NAME_MAX = 120
const DESCRIPTION_MAX = 2000
const DEFAULT_COLOR = COLOR_SWATCHES[1]

function buildSchema(t: (key: string) => string) {
  return z.object({
    calendarType: z.enum(["professional", "class_group"]),
    name: z
      .string()
      .trim()
      .min(2, t("calendar.create.nameTooShort"))
      .max(NAME_MAX, t("calendar.create.nameTooLong")),
    description: z.string().trim().max(DESCRIPTION_MAX, t("calendar.create.descriptionTooLong")),
    timeZone: z.string().nullable().refine(Boolean, t("calendar.create.timeZoneRequired")),
    color: z.string().nullable(),
  })
}

type CreateCalendarValues = z.infer<ReturnType<typeof buildSchema>>

type CreateCalendarPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** O calendário já existe quando isto é chamado. Navegar até ele é de quem abriu o painel. */
  onCreated?: (calendar: AgendaCalendar) => void
}

/**
 * Criar um calendário. Só nasce na primeira abertura: a tela principal monta este painel fechado,
 * e não há por que perguntar a organização nem montar a lista de fusos até alguém precisar.
 */
export function CreateCalendarPanel(props: CreateCalendarPanelProps): JSX.Element {
  const session = useOpenCount(props.open)
  return session > 0 ? <CreateCalendarForm key={session} {...props} /> : <></>
}

function CreateCalendarForm({ open, onOpenChange, onCreated }: CreateCalendarPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { organization } = useOrganization()
  const { createCalendar } = useCalendarMutations()

  const organizationZone = organization.timezone
  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<CreateCalendarValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      calendarType: "professional",
      name: "",
      description: "",
      timeZone: organizationZone,
      color: DEFAULT_COLOR,
    },
    mode: "onBlur",
  })

  const zones = useMemo(
    () => timezoneOptions(language, organizationZone),
    [language, organizationZone]
  )

  const close = () => onOpenChange(false)
  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const submit = useFormSubmit(form, async (values) => {
    const created = await createCalendar({
      calendarType: values.calendarType,
      name: values.name,
      description: values.description || null,
      timeZone: values.timeZone ?? undefined,
      color: values.color,
    })
    form.reset(values)
    toast.success(t("calendar.create.done", { name: created.name }))
    close()
    onCreated?.(created)
  })

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={t("calendar.create.title")}
      description={t("calendar.create.description")}
      onSubmit={submit}
      footer={
        <FormActions form={form} submitLabel={t("calendar.create.submit")} onCancel={close} />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <RadioField
          control={form.control}
          name="calendarType"
          label={t("calendar.create.type")}
          hint={t("calendar.create.typeHint")}
          variant="cards"
          orientation="horizontal"
          options={[
            {
              value: "professional",
              label: t("calendar.create.types.professional.label"),
              description: t("calendar.create.types.professional.description"),
              icon: <Users />,
            },
            {
              value: "class_group",
              label: t("calendar.create.types.class_group.label"),
              description: t("calendar.create.types.class_group.description"),
              icon: <GraduationCap />,
            },
          ]}
        />
        <TextField
          control={form.control}
          name="name"
          label={t("calendar.create.name")}
          placeholder={t("calendar.create.namePlaceholder")}
          maxLength={NAME_MAX}
          autoComplete="off"
          autoFocus
        />
        <TextareaField
          control={form.control}
          name="description"
          label={t("calendar.create.descriptionField")}
          placeholder={t("calendar.create.descriptionPlaceholder")}
          maxLength={DESCRIPTION_MAX}
          optional
        />
        <ComboboxField
          control={form.control}
          name="timeZone"
          label={t("calendar.create.timeZone")}
          hint={t("calendar.create.timeZoneHint")}
          options={zones}
          emptyLabel={t("calendar.create.timeZoneEmpty")}
        />
        <ColorField
          control={form.control}
          name="color"
          label={t("calendar.create.color")}
          hint={t("calendar.create.colorHint")}
        />
      </div>
    </SidePanel>
  )
}
