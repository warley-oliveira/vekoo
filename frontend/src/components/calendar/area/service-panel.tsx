import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Trash2 } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  FormActions,
  NumberField,
  SidePanel,
  TextareaField,
  TextField,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useServiceMutations } from "@/hooks/calendar/use-professionals"
import { useGuardedClose } from "@/hooks/use-panel-session"
import type { AgendaCalendar, AgendaService, Professional } from "@/lib/calendar/types"
import {
  FULL,
  distributionForApi,
  forProfessionals,
  splitEvenly,
  sumOf,
  type Distribution,
} from "./distribution"
import { DistributionField } from "./distribution-field"
import { FormSection } from "./form-section"

const WHOLE = { maximumFractionDigits: 0 }

function buildSchema(t: (key: string) => string) {
  const positive = (message: string) =>
    z.number().nullable().refine((value) => value !== null && Number.isInteger(value) && value > 0, message)
  const notNegative = (message: string) =>
    z.number().nullable().refine((value) => value === null || (Number.isInteger(value) && value >= 0), message)

  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("calendar.services.fields.nameRequired"))
      .max(120, t("calendar.services.fields.nameTooLong")),
    description: z.string(),
    duration: positive(t("calendar.services.fields.durationRequired")),
    timeIncrementInterval: positive(t("calendar.services.fields.intervalRequired")),
    bufferBefore: notNegative(t("calendar.services.fields.bufferInvalid")),
    bufferAfter: notNegative(t("calendar.services.fields.bufferInvalid")),
    guestLimit: z
      .number()
      .nullable()
      .refine(
        (value) => value === null || (Number.isInteger(value) && value >= 1),
        t("calendar.services.fields.guestLimitInvalid")
      ),
    successMessage: z.string(),
    externalId: z.string().trim(),
    distribution: z
      .custom<Distribution>()
      .refine((value) => sumOf(value) === FULL, t("calendar.services.distribution.required")),
  })
}

type ServiceValues = z.infer<ReturnType<typeof buildSchema>>

function valuesOf(service: AgendaService | null, professionals: Professional[]): ServiceValues {
  return {
    name: service?.name ?? "",
    description: service?.description ?? "",
    duration: service?.duration ?? 30,
    timeIncrementInterval: service?.timeIncrementInterval ?? 15,
    bufferBefore: service?.bufferBefore ?? 0,
    bufferAfter: service?.bufferAfter ?? 0,
    guestLimit: service?.guestLimit ?? 1,
    successMessage: service?.successMessage ?? "",
    externalId: service?.externalId ?? "",
    // Serviço novo já nasce salvável: todo mundo por igual, e a pessoa só ajusta se quiser.
    distribution: service
      ? forProfessionals(service.distribution, professionals)
      : forProfessionals(splitEvenly(professionals.map(({ id }) => id)), professionals),
  }
}

type ServicePanelProps = {
  calendar: AgendaCalendar
  /** Sem serviço, o painel cria. */
  service: AgendaService | null
  professionals: Professional[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (service: AgendaService) => void
}

/** Criar e editar um serviço: o que é, quanto tempo leva e quem atende. */
export function ServicePanel({
  calendar,
  service,
  professionals,
  open,
  onOpenChange,
  onDelete,
}: ServicePanelProps) {
  const { t } = useTranslation()
  const { createService, updateService } = useServiceMutations(calendar.id)

  const schema = useMemo(() => buildSchema(t), [t])
  const defaultValues = useMemo(() => valuesOf(service, professionals), [professionals, service])
  const form = useForm<ServiceValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)
  const isClassGroupCalendar = calendar.calendarType === "class_group"
  const noProfessionals = professionals.length === 0

  const submit = useFormSubmit(form, async (values) => {
    const input = {
      name: values.name,
      description: values.description.trim() || null,
      duration: values.duration ?? undefined,
      timeIncrementInterval: values.timeIncrementInterval ?? undefined,
      bufferBefore: values.bufferBefore ?? 0,
      bufferAfter: values.bufferAfter ?? 0,
      guestLimit: values.guestLimit ?? undefined,
      successMessage: values.successMessage.trim() || null,
      externalId: values.externalId || null,
      distribution: distributionForApi(values.distribution, service?.distribution ?? {}, professionals),
    }

    if (service) {
      await updateService(service.id, input)
      form.reset(values)
      toast.success(t("calendar.services.edit.done", { name: values.name }))
    } else {
      const created = await createService(input)
      form.reset(values)
      toast.success(t("calendar.services.create.done", { name: created.name }))
    }
    close()
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="xl"
      title={service?.name ?? t("calendar.services.create.title")}
      description={service ? undefined : t("calendar.services.create.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={
            service ? t("calendar.services.edit.submit") : t("calendar.services.create.submit")
          }
          onCancel={close}
          cancelLabel={service ? t("calendar.schedule.close") : undefined}
          requireChanges={Boolean(service)}
          disabled={noProfessionals}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <FormSection>
          <TextField
            control={form.control}
            name="name"
            label={t("calendar.services.fields.name")}
            placeholder={t("calendar.services.fields.namePlaceholder")}
            autoComplete="off"
            autoFocus={!service}
          />
          <TextareaField
            control={form.control}
            name="description"
            label={t("calendar.services.fields.description")}
            placeholder={t("calendar.services.fields.descriptionPlaceholder")}
            optional
            rows={2}
          />
        </FormSection>

        <FormSection
          title={t("calendar.services.time.title")}
          description={t("calendar.services.time.description")}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              control={form.control}
              name="duration"
              label={t("calendar.services.fields.duration")}
              min={1}
              step={5}
              format={WHOLE}
            />
            <NumberField
              control={form.control}
              name="timeIncrementInterval"
              label={t("calendar.services.fields.interval")}
              hint={t("calendar.services.fields.intervalHint")}
              min={1}
              step={5}
              format={WHOLE}
            />
            <NumberField
              control={form.control}
              name="bufferBefore"
              label={t("calendar.services.fields.bufferBefore")}
              hint={t("calendar.services.fields.bufferHint")}
              min={0}
              step={5}
              format={WHOLE}
            />
            <NumberField
              control={form.control}
              name="bufferAfter"
              label={t("calendar.services.fields.bufferAfter")}
              hint={t("calendar.services.fields.bufferHint")}
              min={0}
              step={5}
              format={WHOLE}
            />
            <NumberField
              control={form.control}
              name="guestLimit"
              label={t("calendar.services.fields.guestLimit")}
              hint={t("calendar.services.fields.guestLimitHint")}
              min={1}
              step={1}
              steppers
              format={WHOLE}
            />
          </div>
        </FormSection>

        <FormSection
          title={t("calendar.services.distribution.title")}
          description={t("calendar.services.distribution.description")}
        >
          {noProfessionals ? (
            <Callout
              tone="warning"
              role="status"
              title={
                isClassGroupCalendar
                  ? t("calendar.services.noCollaborators.classGroupTitle")
                  : t("calendar.services.noCollaborators.title")
              }
              action={
                isClassGroupCalendar ? undefined : (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    size="sm"
                    className="pointer-coarse:h-10"
                    render={<Link to={`/calendar/${calendar.id}/collaborators`} />}
                  >
                    {t("calendar.services.noCollaborators.open")}
                  </Button>
                )
              }
            >
              {isClassGroupCalendar
                ? t("calendar.services.noCollaborators.classGroupDescription")
                : t("calendar.services.noCollaborators.description")}
            </Callout>
          ) : (
            <DistributionField
              control={form.control}
              name="distribution"
              professionals={professionals}
              brokenAtStart={Boolean(service) && sumOf(defaultValues.distribution) !== FULL}
            />
          )}
        </FormSection>

        <FormSection title={t("calendar.services.more.title")}>
          <TextareaField
            control={form.control}
            name="successMessage"
            label={t("calendar.services.fields.successMessage")}
            hint={t("calendar.services.fields.successMessageHint")}
            placeholder={t("calendar.services.fields.successMessagePlaceholder")}
            optional
            rows={2}
          />
          <TextField
            control={form.control}
            name="externalId"
            label={t("calendar.services.fields.externalId")}
            hint={t("calendar.services.fields.externalIdHint")}
            optional
            autoComplete="off"
            spellCheck={false}
          />
        </FormSection>

        {service ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(service)}
            >
              <Trash2 />
              {t("calendar.services.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </SidePanel>
  )
}
