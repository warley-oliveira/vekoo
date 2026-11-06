import type { TFunction } from "i18next"

import type { SelectOption } from "@/components/shared"
import type { ReminderPeriod } from "@/lib/calendar/types"

/** Teto por regra, como na origem: mais do que isso vira ruído na conversa. */
export const MAX_RULES = 5

export const PERIODS: readonly ReminderPeriod[] = ["minutes", "hours", "days"]

/** Ao contato cabe avisar com bastante antecedência; ao colaborador, até uma semana. */
export const CONTACT_INTERVAL_MAX: Record<ReminderPeriod, number> = {
  minutes: 1440,
  hours: 336,
  days: 60,
}

export const COLLABORATOR_INTERVAL_MAX: Record<ReminderPeriod, number> = {
  minutes: 1440,
  hours: 168,
  days: 7,
}

/** "1 dia antes", "2 horas antes". */
export function beforeLabel(t: TFunction, amount: number, period: ReminderPeriod): string {
  return t(`calendar.reminders.before.${period}`, { count: amount })
}

/** A unidade concorda com o número ao lado: "1 dia", "2 dias". */
export function periodOptions(t: TFunction, amount: number | null | undefined): SelectOption[] {
  return PERIODS.map((period) => ({
    value: period,
    label: t(`calendar.reminders.units.${period}`, { count: amount ?? 2 }),
  }))
}

/**
 * As listas de regras não têm id, e a API substitui a lista inteira. Quem salva relê a lista do
 * servidor e troca só a regra que abriu, achada pelo conteúdo: se outra pessoa mudou outra regra
 * enquanto este painel estava aberto, a mudança dela fica. Se mudou esta mesma, nada se perde: a
 * regra entra como nova.
 */
export function replaceRule<T>(list: readonly T[], original: T | null, next: T): T[] {
  const index = original === null ? -1 : findRule(list, original)
  if (index < 0) return [...list, next]
  return list.map((rule, position) => (position === index ? next : rule))
}

export function removeRule<T>(list: readonly T[], original: T): T[] {
  const index = findRule(list, original)
  return index < 0 ? [...list] : list.filter((_, position) => position !== index)
}

function findRule<T>(list: readonly T[], rule: T): number {
  const wanted = JSON.stringify(rule)
  return list.findIndex((candidate) => JSON.stringify(candidate) === wanted)
}
