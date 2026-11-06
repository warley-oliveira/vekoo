import { useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { CalendarClock, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  ColorField,
  ColorPicker,
  CurrencyField,
  DateField,
  FormActions,
  FormField,
  NumberField,
  SelectField,
  SidePanel,
  SwitchField,
  TextareaField,
  TextField,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { ChipsField } from "@/components/shared/chips-input"
import { Button } from "@/components/ui/button"
import { useClassGroupMutations } from "@/hooks/calendar/use-class-groups"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { dayKeyOfLocal, localDateOfDayKey, zoneDisplayName } from "@/lib/calendar/timezone"
import type {
  AgendaCalendar,
  ClassGroup,
  RecurrenceEndType,
  ScheduleDay,
} from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import type { Person } from "@/lib/people/types"
import { COLOR_SWATCHES, contrastRatio, getReadableTextColor } from "@/lib/tag-color"
import { AccountField } from "./account-field"
import { FormSection } from "./form-section"
import { ScheduleField } from "./schedule-editor"
import { emptyWeek, normalizeWeek, weekForApi, weekHasProblems } from "./week-schedule"

const WHOLE = { maximumFractionDigits: 0 }
/** Abaixo disto, o nome da turma fica difícil de ler na grade do calendário. */
const MIN_READABLE_CONTRAST = 3
const DEFAULT_COLOR = COLOR_SWATCHES[0]
/** Os dois que `getReadableTextColor` escolhe: é o que costuma servir. */
const TEXT_SWATCHES = ["#ffffff", "#18181b"]
/** Os mesmos padrões da API para turma nova. */
const DEFAULT_MIN_STUDENTS = 1
const DEFAULT_MAX_STUDENTS = 30
const DEFAULT_DURATION = 60

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(2, t("calendar.classGroups.fields.nameTooShort"))
        .max(120, t("calendar.classGroups.fields.nameTooLong")),
      description: z.string(),
      category: z.string(),
      tags: z.array(z.string()),
      color: z.string().min(1, t("calendar.classGroups.fields.colorRequired")),
      textColor: z.string().min(1, t("calendar.classGroups.fields.colorRequired")),
      minStudents: z
        .number()
        .nullable()
        .refine(
          (value) => value !== null && Number.isInteger(value) && value >= 0,
          t("calendar.classGroups.fields.minStudentsRequired")
        ),
      maxStudents: z
        .number()
        .nullable()
        .refine(
          (value) => value !== null && Number.isInteger(value) && value >= 1,
          t("calendar.classGroups.fields.maxStudentsRequired")
        ),
      defaultDurationMinutes: z
        .number()
        .nullable()
        .refine(
          (value) => value !== null && Number.isInteger(value) && value >= 5,
          t("calendar.classGroups.fields.durationRequired")
        ),
      startDate: z.date().nullable(),
      endDate: z.date().nullable(),
      recurrenceType: z.enum(["weekly", "biweekly", "monthly"]),
      recurrenceEndType: z.enum(["date", "occurrences", "never"]),
      recurrenceOccurrences: z.number().nullable(),
      schedule: z.custom<ScheduleDay[]>(),
      location: z.string(),
      room: z.string(),
      address: z.string(),
      instructorName: z.string(),
      instructorAccountId: z.string().nullable(),
      price: z.number().nullable(),
      active: z.boolean(),
      visible: z.boolean(),
      notes: z.string(),
      externalId: z.string().trim(),
    })
    .superRefine((values, context) => {
      const issue = (path: string, message: string) =>
        context.addIssue({ code: "custom", path: [path], message })

      if (
        values.minStudents !== null &&
        values.maxStudents !== null &&
        values.minStudents > values.maxStudents
      ) {
        issue("minStudents", t("calendar.classGroups.fields.minAboveMax"))
      }
      if (values.recurrenceEndType === "date" && !values.endDate) {
        issue("endDate", t("calendar.classGroups.fields.endDateRequired"))
      }
      if (
        values.recurrenceEndType !== "never" &&
        values.startDate &&
        values.endDate &&
        values.endDate < values.startDate
      ) {
        issue("endDate", t("calendar.classGroups.fields.endBeforeStart"))
      }
      if (
        values.recurrenceEndType === "occurrences" &&
        !(values.recurrenceOccurrences && values.recurrenceOccurrences >= 1)
      ) {
        issue("recurrenceOccurrences", t("calendar.classGroups.fields.occurrencesRequired"))
      }
      if (
        weekHasProblems(values.schedule, {
          endOptional: true,
          defaultDuration: values.defaultDurationMinutes,
        })
      ) {
        issue("schedule", t("calendar.schedule.errors.fix"))
      }
    })
}

type ClassGroupValues = z.infer<ReturnType<typeof buildSchema>>

/**
 * O fim que vale de verdade. A API sempre respeita `endDate`, em qualquer tipo de fim, e ignora "em
 * uma data" sem data e "ocorrências" sem número. A tela mostra o efeito, para o que está escrito
 * nunca contradizer o que acontece no calendário.
 */
function effectiveEnd(classGroup: ClassGroup | null): RecurrenceEndType {
  if (!classGroup) return "never"
  if (classGroup.recurrenceEndType === "occurrences" && classGroup.recurrenceOccurrences) {
    return "occurrences"
  }
  return classGroup.endDate ? "date" : "never"
}

function valuesOf(classGroup: ClassGroup | null): ClassGroupValues {
  const color = classGroup?.color ?? DEFAULT_COLOR
  return {
    name: classGroup?.name ?? "",
    description: classGroup?.description ?? "",
    category: classGroup?.category ?? "",
    tags: classGroup?.tags ?? [],
    color,
    textColor: classGroup?.textColor ?? getReadableTextColor(color),
    minStudents: classGroup ? classGroup.minStudents : DEFAULT_MIN_STUDENTS,
    maxStudents: classGroup ? classGroup.maxStudents : DEFAULT_MAX_STUDENTS,
    defaultDurationMinutes: classGroup ? classGroup.defaultDurationMinutes : DEFAULT_DURATION,
    // Dias puros: viram `Date` local só para o campo, sem passar por instante nem por fuso.
    startDate: classGroup?.startDate ? localDateOfDayKey(classGroup.startDate) : null,
    endDate: classGroup?.endDate ? localDateOfDayKey(classGroup.endDate) : null,
    recurrenceType: classGroup?.recurrenceType ?? "weekly",
    recurrenceEndType: effectiveEnd(classGroup),
    recurrenceOccurrences: classGroup?.recurrenceOccurrences ?? null,
    schedule: classGroup ? normalizeWeek(classGroup.schedule) : emptyWeek(),
    location: classGroup?.location ?? "",
    room: classGroup?.room ?? "",
    address: classGroup?.address ?? "",
    instructorName: classGroup?.instructorName ?? "",
    instructorAccountId: classGroup?.instructorAccountId ?? null,
    price: classGroup?.priceCents != null ? classGroup.priceCents / 100 : null,
    active: classGroup?.active ?? true,
    visible: classGroup?.visible ?? true,
    notes: classGroup?.notes ?? "",
    externalId: classGroup?.externalId ?? "",
  }
}

type ClassGroupPanelProps = {
  calendar: AgendaCalendar
  /** Sem turma, o painel cria. */
  classGroup: ClassGroup | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (classGroup: ClassGroup) => void
  /** Fecha este painel e abre o de inscritos. */
  onEnrollments: (classGroup: ClassGroup) => void
  /** Criou: quem acabou de criar a turma costuma querer inscrever gente. */
  onCreated: (classGroup: ClassGroup) => void
}

/** Criar e editar uma turma: o que é, quando acontece, onde, com quem e por quanto. */
export function ClassGroupPanel({
  calendar,
  classGroup,
  open,
  onOpenChange,
  onDelete,
  onEnrollments,
  onCreated,
}: ClassGroupPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const { createClassGroup, updateClassGroup } = useClassGroupMutations(calendar.id)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<ClassGroupValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(classGroup),
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const input = {
      name: values.name,
      description: values.description.trim() || null,
      category: values.category.trim() || null,
      tags: values.tags,
      color: values.color,
      textColor: values.textColor,
      minStudents: values.minStudents,
      maxStudents: values.maxStudents,
      defaultDurationMinutes: values.defaultDurationMinutes,
      startDate: values.startDate ? dayKeyOfLocal(values.startDate) : null,
      endDate:
        values.recurrenceEndType !== "never" && values.endDate
          ? dayKeyOfLocal(values.endDate)
          : null,
      recurrenceType: values.recurrenceType,
      recurrenceEndType: values.recurrenceEndType,
      recurrenceOccurrences:
        values.recurrenceEndType === "occurrences" ? values.recurrenceOccurrences : null,
      schedule: weekForApi(values.schedule),
      location: values.location.trim() || null,
      room: values.room.trim() || null,
      address: values.address.trim() || null,
      instructorName: values.instructorName.trim() || null,
      instructorAccountId: values.instructorAccountId,
      priceCents: values.price === null ? null : Math.round(values.price * 100),
      priceCurrency: classGroup?.priceCurrency ?? "BRL",
      active: values.active,
      visible: values.visible,
      notes: values.notes.trim() || null,
      externalId: values.externalId || null,
    }

    if (classGroup) {
      await updateClassGroup(classGroup.id, input)
      form.reset(values)
      toast.success(t("calendar.classGroups.edit.done", { name: values.name }))
      close()
    } else {
      const created = await createClassGroup(input)
      form.reset(values)
      onCreated(created)
      close()
    }
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)
  // Com alteração pendente, sair para os inscritos pergunta como sair por qualquer outro lugar.
  const requestEnrollments = useGuardedClose(isDirty, () => {
    if (classGroup) onEnrollments(classGroup)
  })

  const control = form.control
  const name = useWatch({ control, name: "name" })
  const color = useWatch({ control, name: "color" })
  const textColor = useWatch({ control, name: "textColor" })
  const endType = useWatch({ control, name: "recurrenceEndType" })
  const startDate = useWatch({ control, name: "startDate" })
  const maxStudents = useWatch({ control, name: "maxStudents" })
  const defaultDuration = useWatch({ control, name: "defaultDurationMinutes" })
  const instructorAccountId = useWatch({ control, name: "instructorAccountId" })
  const schedule = useWatch({ control, name: "schedule" })

  const noDays = !schedule.some((day) => day.enabled)
  const lowContrast =
    Boolean(color && textColor) && contrastRatio(color, textColor) < MIN_READABLE_CONTRAST

  const enrolled = classGroup?.activeEnrollmentCount ?? 0
  const scheduleChanged = Boolean(classGroup) && Boolean(form.formState.dirtyFields.schedule)

  const pickInstructor = (person: Person | null) => {
    if (person) form.setValue("instructorName", person.name, { shouldDirty: true })
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="xl"
      title={classGroup?.name ?? t("calendar.classGroups.create.title")}
      description={classGroup ? undefined : t("calendar.classGroups.create.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={
            classGroup
              ? t("calendar.classGroups.edit.submit")
              : t("calendar.classGroups.create.submit")
          }
          onCancel={close}
          cancelLabel={classGroup ? t("calendar.schedule.close") : undefined}
          requireChanges={Boolean(classGroup)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <FormSection>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <TextField
              control={control}
              name="name"
              label={t("calendar.classGroups.fields.name")}
              placeholder={t("calendar.classGroups.fields.namePlaceholder")}
              autoComplete="off"
              autoFocus={!classGroup}
            />
            <TextField
              control={control}
              name="category"
              label={t("calendar.classGroups.fields.category")}
              placeholder={t("calendar.classGroups.fields.categoryPlaceholder")}
              optional
              autoComplete="off"
            />
          </div>
          <TextareaField
            control={control}
            name="description"
            label={t("calendar.classGroups.fields.description")}
            placeholder={t("calendar.classGroups.fields.descriptionPlaceholder")}
            optional
            rows={2}
          />
          <ChipsField
            control={control}
            name="tags"
            label={t("calendar.classGroups.fields.tags")}
            hint={t("calendar.classGroups.fields.tagsHint")}
            placeholder={t("calendar.classGroups.fields.tagsPlaceholder")}
            optional
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr]">
            <FormField
              control={control}
              name="color"
              label={t("calendar.classGroups.fields.color")}
            >
              {({ field, controlProps }) => (
                <ColorPicker
                  {...controlProps}
                  triggerRef={field.ref}
                  label={t("calendar.classGroups.fields.color")}
                  value={field.value}
                  onBlur={field.onBlur}
                  // O texto acompanha a cor, como na origem. Quem quiser outro escolhe depois.
                  onChange={(next) => {
                    field.onChange(next)
                    form.setValue("textColor", getReadableTextColor(next), { shouldDirty: true })
                  }}
                />
              )}
            </FormField>
            <ColorField
              control={control}
              name="textColor"
              label={t("calendar.classGroups.fields.textColor")}
              swatches={TEXT_SWATCHES}
            />
            <div className="space-y-1.5">
              <span className="block text-sm leading-none font-medium">
                {t("calendar.classGroups.fields.preview")}
              </span>
              <div
                // Cores escolhidas pela pessoa: é como a aula aparece na grade.
                style={{ backgroundColor: color, color: textColor }}
                className="flex h-8 items-center truncate rounded-md px-2.5 text-sm font-medium pointer-coarse:h-10"
              >
                <span className="truncate">
                  {name?.trim() || t("calendar.classGroups.fields.previewPlaceholder")}
                </span>
              </div>
            </div>
          </div>
          {lowContrast ? (
            <p role="status" className="-mt-2 text-xs text-status-warning">
              {t("calendar.classGroups.fields.lowContrast")}
            </p>
          ) : null}
        </FormSection>

        <FormSection title={t("calendar.classGroups.capacity.title")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              control={control}
              name="minStudents"
              label={t("calendar.classGroups.fields.minStudents")}
              min={0}
              step={1}
              steppers
              format={WHOLE}
            />
            <NumberField
              control={control}
              name="maxStudents"
              label={t("calendar.classGroups.fields.maxStudents")}
              min={1}
              step={1}
              steppers
              format={WHOLE}
              hint={
                maxStudents !== null && maxStudents < enrolled
                  ? t("calendar.classGroups.fields.maxBelowEnrolled", { count: enrolled })
                  : undefined
              }
            />
            <NumberField
              control={control}
              name="defaultDurationMinutes"
              label={t("calendar.classGroups.fields.duration")}
              hint={t("calendar.classGroups.fields.durationHint")}
              min={5}
              step={5}
              format={WHOLE}
            />
          </div>
          {classGroup ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {classGroup.maxStudents
                  ? t("calendar.classGroups.seats.occupied", {
                      count: classGroup.maxStudents,
                      active: enrolled,
                    })
                  : t("calendar.classGroups.seats.unset", { count: enrolled })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:h-10"
                onClick={() => void requestEnrollments()}
              >
                <Users />
                {t("calendar.classGroups.enrollments.open")}
              </Button>
            </div>
          ) : null}
        </FormSection>

        <FormSection
          title={t("calendar.classGroups.when.title")}
          description={t("calendar.classGroups.when.description")}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              control={control}
              name="startDate"
              label={t("calendar.classGroups.fields.startDate")}
              hint={t("calendar.classGroups.fields.startDateHint")}
              optional
              clearable
            />
            <SelectField
              control={control}
              name="recurrenceType"
              label={t("calendar.classGroups.fields.recurrenceType")}
              options={[
                { value: "weekly", label: t("calendar.classGroups.recurrence.weekly") },
                { value: "biweekly", label: t("calendar.classGroups.recurrence.biweekly") },
                { value: "monthly", label: t("calendar.classGroups.recurrence.monthly") },
              ]}
            />
            <SelectField
              control={control}
              name="recurrenceEndType"
              label={t("calendar.classGroups.fields.recurrenceEndType")}
              options={[
                { value: "never", label: t("calendar.classGroups.recurrenceEnd.never") },
                { value: "date", label: t("calendar.classGroups.recurrenceEnd.date") },
                {
                  value: "occurrences",
                  label: t("calendar.classGroups.recurrenceEnd.occurrences"),
                },
              ]}
            />
            <AnimatePresence initial={false}>
              {endType === "occurrences" ? (
                <motion.div key="occurrences" {...preset.fade}>
                  <NumberField
                    control={control}
                    name="recurrenceOccurrences"
                    label={t("calendar.classGroups.fields.occurrences")}
                    hint={t("calendar.classGroups.fields.occurrencesHint")}
                    min={1}
                    step={1}
                    steppers
                    format={WHOLE}
                  />
                </motion.div>
              ) : null}
              {endType !== "never" ? (
                <motion.div key="endDate" {...preset.fade}>
                  <DateField
                    control={control}
                    name="endDate"
                    label={t("calendar.classGroups.fields.endDate")}
                    hint={
                      endType === "occurrences"
                        ? t("calendar.classGroups.fields.endDateLimitHint")
                        : undefined
                    }
                    optional={endType === "occurrences"}
                    clearable={endType === "occurrences"}
                    min={startDate ?? undefined}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex flex-col gap-2">
            <div className="space-y-0.5">
              <h4 className="text-sm font-medium">{t("calendar.classGroups.when.grid")}</h4>
              <p className="text-xs leading-snug text-pretty text-muted-foreground">
                {t("calendar.classGroups.when.gridHint", {
                  zone: zoneDisplayName(calendar.timeZone, language),
                })}
              </p>
            </div>
            <ScheduleField
              control={control}
              name="schedule"
              variant="classGroup"
              defaultDuration={defaultDuration}
            />
            {noDays ? (
              <p role="status" className="text-xs leading-snug text-status-warning">
                {t("calendar.classGroups.when.noDays")}
              </p>
            ) : null}
          </div>

          <AnimatePresence initial={false}>
            {scheduleChanged ? (
              <motion.div key="moved" {...preset.slideUp}>
                <Callout
                  tone="info"
                  role="status"
                  icon={<CalendarClock />}
                  title={t("calendar.classGroups.when.changedTitle")}
                >
                  {t("calendar.classGroups.when.changedDescription")}
                </Callout>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </FormSection>

        <FormSection title={t("calendar.classGroups.where.title")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={control}
              name="location"
              label={t("calendar.classGroups.fields.location")}
              placeholder={t("calendar.classGroups.fields.locationPlaceholder")}
              optional
              autoComplete="off"
            />
            <TextField
              control={control}
              name="room"
              label={t("calendar.classGroups.fields.room")}
              placeholder={t("calendar.classGroups.fields.roomPlaceholder")}
              optional
              autoComplete="off"
            />
          </div>
          <TextField
            control={control}
            name="address"
            label={t("calendar.classGroups.fields.address")}
            placeholder={t("calendar.classGroups.fields.addressPlaceholder")}
            optional
            autoComplete="off"
          />
        </FormSection>

        <FormSection title={t("calendar.classGroups.who.title")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={control}
              name="instructorName"
              label={t("calendar.classGroups.fields.instructorName")}
              placeholder={t("calendar.classGroups.fields.instructorNamePlaceholder")}
              optional
              autoComplete="off"
            />
            <AccountField
              control={control}
              name="instructorAccountId"
              label={t("calendar.classGroups.fields.instructorAccount")}
              hint={t("calendar.classGroups.fields.instructorAccountHint")}
              optional
              placeholder={t("calendar.classGroups.fields.instructorAccountPlaceholder")}
              currentLabel={
                classGroup?.instructorAccountId === instructorAccountId
                  ? classGroup?.instructorName
                  : null
              }
              onPick={pickInstructor}
            />
          </div>
        </FormSection>

        <FormSection title={t("calendar.classGroups.more.title")}>
          <CurrencyField
            control={control}
            name="price"
            label={t("calendar.classGroups.fields.price")}
            currency={classGroup?.priceCurrency ?? "BRL"}
            optional
          />
          <SwitchField
            control={control}
            name="active"
            label={t("calendar.classGroups.fields.active")}
            hint={t("calendar.classGroups.fields.activeHint")}
          />
          <SwitchField
            control={control}
            name="visible"
            label={t("calendar.classGroups.fields.visible")}
            hint={t("calendar.classGroups.fields.visibleHint")}
          />
          <TextareaField
            control={control}
            name="notes"
            label={t("calendar.classGroups.fields.notes")}
            placeholder={t("calendar.classGroups.fields.notesPlaceholder")}
            optional
            rows={2}
          />
          <TextField
            control={control}
            name="externalId"
            label={t("calendar.classGroups.fields.externalId")}
            hint={t("calendar.classGroups.fields.externalIdHint")}
            optional
            autoComplete="off"
            spellCheck={false}
          />
        </FormSection>

        {classGroup ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(classGroup)}
            >
              <Trash2 />
              {t("calendar.classGroups.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </SidePanel>
  )
}
