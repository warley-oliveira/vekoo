import type { TFunction } from "i18next"
import { z } from "zod"

import {
  checkMessageRule,
  messageRulePayload,
  messageRuleShape,
  messageRuleValues,
} from "@/components/calendar/settings/message-rule"
import type {
  AttendanceSequence,
  ReminderPeriod,
  SequenceStep,
  SequenceTrigger,
} from "@/lib/calendar/types"

const NAME_MAX = 120

const UNIT_MINUTES: Record<ReminderPeriod, number> = { minutes: 1, hours: 60, days: 1440 }

/** O prazo depois do fim é guardado em minutos; a tela mostra na unidade mais redonda. */
export function splitMinutes(total: number): { amount: number; unit: ReminderPeriod } {
  if (total > 0 && total % UNIT_MINUTES.days === 0) return { amount: total / UNIT_MINUTES.days, unit: "days" }
  if (total > 0 && total % UNIT_MINUTES.hours === 0) return { amount: total / UNIT_MINUTES.hours, unit: "hours" }
  return { amount: Math.max(1, total), unit: "minutes" }
}

export function toMinutes(amount: number, unit: ReminderPeriod): number {
  return Math.max(1, Math.round(amount * UNIT_MINUTES[unit]))
}

export function buildSequenceSchema(t: TFunction) {
  const nameTooLong = t("calendar.sequences.validation.nameTooLong")

  const step = z
    .object({
      /** Vazio em passo novo: a API dá um id ao salvar. */
      id: z.string().optional(),
      name: z
        .string()
        .trim()
        .min(1, t("calendar.sequences.validation.stepNameRequired"))
        .max(NAME_MAX, nameTooLong),
      ...messageRuleShape(t),
      runAfter: z.number().nullable(),
      runAfterUnit: z.enum(["minutes", "hours", "days"]),
      allDay: z.boolean(),
      timeFrom: z.number().nullable(),
      timeAt: z.number().nullable(),
    })
    .superRefine((values, ctx) => {
      checkMessageRule(values, ctx, t)

      if (values.runAfter === null) {
        ctx.addIssue({
          code: "custom",
          path: ["runAfter"],
          message: t("calendar.sequences.validation.delayRequired"),
        })
      } else if (!Number.isInteger(values.runAfter) || values.runAfter < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["runAfter"],
          message: t("calendar.sequences.validation.delayInvalid"),
        })
      }

      if (values.allDay) return

      // As duas em branco é a janela padrão. Uma só não diz nada.
      const { timeFrom: from, timeAt: to } = values
      if (from === null && to === null) return

      const windowError = (path: "timeFrom" | "timeAt", key: string) =>
        ctx.addIssue({ code: "custom", path: [path], message: t(`calendar.sequences.validation.${key}`) })

      if (from === null) windowError("timeFrom", "windowBoth")
      else if (!Number.isInteger(from) || from < 0 || from > 23) windowError("timeFrom", "windowFrom")

      if (to === null) windowError("timeAt", "windowBoth")
      else if (!Number.isInteger(to) || to < 1 || to > 24) windowError("timeAt", "windowTo")

      if (from !== null && to !== null && from >= to) windowError("timeAt", "windowOrder")
    })

  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t("calendar.sequences.validation.nameRequired"))
        .max(NAME_MAX, nameTooLong),
      enabled: z.boolean(),
      autoEnroll: z.boolean(),
      autoEnrollAnchors: z.array(z.enum(["attendance_mark", "after_event_end"])),
      autoEnrollMinutesAfterEnd: z.number().nullable(),
      stopOnReply: z.boolean(),
      ignoreAutomationPaused: z.boolean(),
      reactivateAutomation: z.boolean(),
      steps: z.array(step).min(1, t("calendar.sequences.validation.stepsRequired")),
    })
    .superRefine((values, ctx) => {
      const minutes = values.autoEnrollMinutesAfterEnd
      if (
        values.autoEnroll &&
        values.autoEnrollAnchors.includes("after_event_end") &&
        (minutes === null || minutes < 1)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["autoEnrollMinutesAfterEnd"],
          message: t("calendar.sequences.validation.delayRequired"),
        })
      }
    })
}

export type SequenceValues = z.infer<ReturnType<typeof buildSequenceSchema>>
export type StepValues = SequenceValues["steps"][number]

function stepToValues(step: SequenceStep): StepValues {
  return {
    ...(step.id ? { id: step.id } : {}),
    name: step.name ?? "",
    ...messageRuleValues(step),
    runAfter: step.runAfter,
    runAfterUnit: step.runAfterUnit,
    allDay: Boolean(step.allDay),
    timeFrom: step.timeFrom ?? null,
    timeAt: step.timeAt ?? null,
  }
}

export function sequenceToValues(sequence: AttendanceSequence): SequenceValues {
  return {
    name: sequence.name,
    enabled: sequence.enabled,
    autoEnroll: sequence.autoEnroll,
    autoEnrollAnchors: sequence.autoEnrollAnchors?.length
      ? sequence.autoEnrollAnchors
      : ["attendance_mark"],
    autoEnrollMinutesAfterEnd: sequence.autoEnrollMinutesAfterEnd ?? 60,
    stopOnReply: sequence.stopOnReply,
    ignoreAutomationPaused: sequence.ignoreAutomationPaused,
    reactivateAutomation: sequence.reactivateAutomation,
    steps: sequence.steps.map(stepToValues),
  }
}

export function valuesToSequence(
  values: SequenceValues,
  origin: { id?: string; trigger: SequenceTrigger }
): AttendanceSequence {
  // A âncora "depois do fim" só existe para quem faltou: para quem veio, alguém já marcou.
  const anchors =
    origin.trigger === "no_show" && values.autoEnrollAnchors.length > 0
      ? values.autoEnrollAnchors
      : (["attendance_mark"] as const)

  return {
    ...(origin.id ? { id: origin.id } : {}),
    name: values.name,
    trigger: origin.trigger,
    enabled: values.enabled,
    autoEnroll: values.autoEnroll,
    stopOnReply: values.stopOnReply,
    ignoreAutomationPaused: values.ignoreAutomationPaused,
    reactivateAutomation: values.reactivateAutomation,
    autoEnrollAnchors: [...anchors],
    autoEnrollMinutesAfterEnd: values.autoEnrollMinutesAfterEnd ?? 60,
    steps: values.steps.map((step) => ({
      ...(step.id ? { id: step.id } : {}),
      name: step.name,
      ...messageRulePayload(step),
      runAfter: step.runAfter as number,
      runAfterUnit: step.runAfterUnit,
      timeFrom: step.timeFrom,
      timeAt: step.timeAt,
      allDay: step.allDay,
    })),
  }
}

export function newStepValues(t: TFunction): StepValues {
  return {
    name: t("calendar.sequences.defaults.step"),
    mode: "text",
    message: "",
    aiPrompt: "",
    runAfter: 1,
    runAfterUnit: "hours",
    allDay: false,
    // Em branco é a janela padrão, e a tela diz qual é.
    timeFrom: null,
    timeAt: null,
  }
}

export function newSequence(trigger: SequenceTrigger, t: TFunction): AttendanceSequence {
  return {
    name: t("calendar.sequences.defaults.sequence"),
    trigger,
    enabled: true,
    autoEnroll: false,
    stopOnReply: false,
    ignoreAutomationPaused: false,
    reactivateAutomation: false,
    autoEnrollAnchors: ["attendance_mark"],
    autoEnrollMinutesAfterEnd: 60,
    steps: [
      {
        name: t("calendar.sequences.defaults.step"),
        message: "",
        runAfter: 1,
        runAfterUnit: "hours",
        timeFrom: null,
        timeAt: null,
        allDay: false,
      },
    ],
  }
}
