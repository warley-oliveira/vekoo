import { useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Trash2 } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import {
  ColorField,
  FormActions,
  PhoneField,
  SidePanel,
  TextField,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useProfessionalMutations } from "@/hooks/calendar/use-professionals"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { zoneDisplayName } from "@/lib/calendar/timezone"
import type {
  AgendaCalendar,
  AgendaService,
  BlockedTime,
  Professional,
  ScheduleDay,
} from "@/lib/calendar/types"
import { formatNumber } from "@/lib/format-number"
import { onlyDigits } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"
import { COLOR_SWATCHES } from "@/lib/tag-color"
import type { Person } from "@/lib/people/types"
import { AccountField } from "./account-field"
import { blockedProblem, normalizeBlockedTimes } from "./blocked-times"
import { BlockedTimesField } from "./blocked-times-field"
import { FormSection } from "./form-section"
import { ScheduleField } from "./schedule-editor"
import {
  defaultProfessionalWeek,
  normalizeWeek,
  weekForApi,
  weekHasProblems,
} from "./week-schedule"

/** Os avisos no WhatsApp usam o número como está gravado, então ele precisa ser discável. */
const DIALABLE_PHONE = /^\d{12,15}$/

function buildSchema(t: (key: string) => string) {
  return z.object({
    accountId: z.string().nullable(),
    name: z
      .string()
      .trim()
      .min(1, t("calendar.collaborators.fields.nameRequired"))
      .max(120, t("calendar.collaborators.fields.nameTooLong")),
    email: z
      .string()
      .trim()
      .refine(
        (value) => !value || z.email().safeParse(value).success,
        t("calendar.collaborators.fields.emailInvalid")
      ),
    phone: z
      .string()
      .refine(
        (value) => !value || DIALABLE_PHONE.test(onlyDigits(value)),
        t("calendar.collaborators.fields.phoneInvalid")
      ),
    color: z.string().min(1, t("calendar.collaborators.fields.colorRequired")),
    externalId: z.string().trim(),
    days: z
      .custom<ScheduleDay[]>()
      .refine((days) => !weekHasProblems(days), t("calendar.schedule.errors.fix")),
    blockedTimes: z
      .custom<BlockedTime[]>()
      .refine(
        (blocks) => blocks.every((block) => !blockedProblem(block)),
        t("calendar.schedule.errors.fix")
      ),
  })
}

type CollaboratorValues = z.infer<ReturnType<typeof buildSchema>>

function valuesOf(professional: Professional | null, suggestedColor: string): CollaboratorValues {
  return {
    accountId: professional?.accountId ?? null,
    name: professional?.name ?? "",
    email: professional?.email ?? "",
    phone: professional?.phone ?? "",
    color: professional?.color ?? suggestedColor,
    externalId: professional?.externalId ?? "",
    // Sem `rule`, a API daria o padrão: a tela mostra esse mesmo padrão, para a pessoa ver e mudar.
    days: professional ? normalizeWeek(professional.rule?.days) : defaultProfessionalWeek(),
    blockedTimes: normalizeBlockedTimes(professional?.rule?.blockedTimes),
  }
}

/** A próxima cor que ninguém deste calendário usa, para os colaboradores se distinguirem na grade. */
function suggestColor(professionals: Professional[]): string {
  const used = new Set(professionals.map((professional) => professional.color?.toLowerCase()))
  return COLOR_SWATCHES.find((color) => !used.has(color)) ?? COLOR_SWATCHES[0]
}

type CollaboratorPanelProps = {
  calendar: AgendaCalendar
  /** Sem colaborador, o painel cria. */
  professional: Professional | null
  professionals: Professional[]
  services: AgendaService[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (professional: Professional) => void
  /** Criou: quem chega ainda não atende nada, e o recado leva para os serviços. */
  onCreated: (professional: Professional) => void
}

/** Criar e editar um colaborador: quem é, os horários da semana e os bloqueios. */
export function CollaboratorPanel({
  calendar,
  professional,
  professionals,
  services,
  open,
  onOpenChange,
  onDelete,
  onCreated,
}: CollaboratorPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { createProfessional, updateProfessional } = useProfessionalMutations(calendar.id)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<CollaboratorValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(professional, suggestColor(professionals)),
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const input = {
      accountId: values.accountId,
      name: values.name,
      email: values.email || null,
      phone: values.phone || null,
      color: values.color,
      externalId: values.externalId || null,
      rule: { days: weekForApi(values.days), blockedTimes: values.blockedTimes },
    }

    if (professional) {
      await updateProfessional(professional.id, input)
      form.reset(values)
      toast.success(t("calendar.collaborators.edit.done", { name: values.name }))
    } else {
      const created = await createProfessional(input)
      form.reset(values)
      onCreated(created)
    }
    close()
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const accountId = useWatch({ control: form.control, name: "accountId" })
  const linked = Boolean(accountId)

  /** Com conta ligada, nome e e-mail são os dela: a API os copia ao salvar. */
  const pickAccount = (person: Person | null) => {
    if (!person) return
    const options = { shouldDirty: true, shouldValidate: true }
    form.setValue("name", person.name, options)
    form.setValue("email", person.email, options)
    if (person.phone && !form.getValues("phone")) form.setValue("phone", person.phone, options)
  }

  const takenIds = useMemo(
    () =>
      new Set(
        professionals.flatMap((other) =>
          other.accountId && other.id !== professional?.id ? [other.accountId] : []
        )
      ),
    [professional?.id, professionals]
  )

  const servedHere = professional
    ? services.filter((service) => (service.distribution[professional.id] ?? 0) > 0)
    : []

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="xl"
      title={professional?.name ?? t("calendar.collaborators.create.title")}
      description={professional ? undefined : t("calendar.collaborators.create.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={
            professional
              ? t("calendar.collaborators.edit.submit")
              : t("calendar.collaborators.create.submit")
          }
          onCancel={close}
          cancelLabel={professional ? t("calendar.schedule.close") : undefined}
          requireChanges={Boolean(professional)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <FormSection>
          <AccountField
            control={form.control}
            name="accountId"
            label={t("calendar.collaborators.fields.account")}
            hint={t("calendar.collaborators.fields.accountHint")}
            optional
            placeholder={t("calendar.collaborators.fields.accountPlaceholder")}
            takenIds={takenIds}
            takenLabel={t("calendar.collaborators.fields.accountTaken")}
            currentLabel={professional?.accountId === accountId ? professional?.name : null}
            onPick={pickAccount}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="name"
              label={t("calendar.collaborators.fields.name")}
              placeholder={t("calendar.collaborators.fields.namePlaceholder")}
              hint={linked ? t("calendar.collaborators.fields.fromAccount") : undefined}
              disabled={linked}
              autoComplete="off"
              spellCheck={false}
              autoFocus={!professional}
            />
            <TextField
              control={form.control}
              name="email"
              type="email"
              label={t("calendar.collaborators.fields.email")}
              placeholder={t("calendar.collaborators.fields.emailPlaceholder")}
              hint={linked ? t("calendar.collaborators.fields.fromAccount") : undefined}
              optional={!linked}
              disabled={linked}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <PhoneField
            control={form.control}
            name="phone"
            label={t("calendar.collaborators.fields.phone")}
            hint={t("calendar.collaborators.fields.phoneHint")}
            optional
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField
              control={form.control}
              name="color"
              label={t("calendar.collaborators.fields.color")}
              hint={t("calendar.collaborators.fields.colorHint")}
            />
            <TextField
              control={form.control}
              name="externalId"
              label={t("calendar.collaborators.fields.externalId")}
              hint={t("calendar.collaborators.fields.externalIdHint")}
              optional
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </FormSection>

        <FormSection
          title={t("calendar.collaborators.week.title")}
          description={t("calendar.collaborators.week.description", {
            zone: zoneDisplayName(calendar.timeZone, language),
          })}
        >
          <ScheduleField control={form.control} name="days" variant="professional" />
        </FormSection>

        <FormSection
          title={t("calendar.collaborators.blocks.title")}
          description={t("calendar.collaborators.blocks.description")}
        >
          <BlockedTimesField
            control={form.control}
            name="blockedTimes"
            timeZone={calendar.timeZone}
          />
        </FormSection>

        {professional ? (
          <FormSection
            title={t("calendar.collaborators.services.title")}
            description={
              servedHere.length === 0
                ? t("calendar.collaborators.services.none")
                : new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
                    servedHere.map((service) =>
                      t("calendar.collaborators.services.share", {
                        name: service.name,
                        percent: formatNumber(service.distribution[professional.id], language),
                      })
                    )
                  )
            }
            action={
              <Button
                nativeButton={false}
                variant="ghost"
                size="sm"
                className="pointer-coarse:h-10"
                render={<Link to={`/calendar/${calendar.id}/services`} />}
              >
                {t("calendar.collaborators.services.open")}
              </Button>
            }
          />
        ) : null}

        {professional ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(professional)}
            >
              <Trash2 />
              {t("calendar.collaborators.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </SidePanel>
  )
}
