// Datas sempre pelo `Intl`, com o idioma ativo (`useLanguage()`). A API entrega
// milissegundos; `Date` e ISO também são aceitos para quem vem de um campo.

export type DateInput = number | string | Date

export function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value)
}

export function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime())
}

export function capitalizeFirstLetter(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "12/05/2026" (`short`), "12 de mai. de 2026" (`medium`), "12 de maio de 2026" (`long`). */
export function formatDate(
  value: DateInput,
  language: string,
  style: "short" | "medium" | "long" = "medium"
): string {
  return new Intl.DateTimeFormat(language, { dateStyle: style }).format(toDate(value))
}

/** "14:30". */
export function formatTime(value: DateInput, language: string): string {
  return new Intl.DateTimeFormat(language, { timeStyle: "short" }).format(toDate(value))
}

/** "12 de mai. de 2026, 14:30". */
export function formatDateTime(value: DateInput, language: string): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(toDate(value))
}

/** A forma completa, para tooltips: "terça-feira, 12 de maio de 2026 às 14:30". */
export function formatFullDateTime(value: DateInput, language: string): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(toDate(value))
}

/** Intervalo curto, deixando o `Intl` juntar o que se repete: "1 – 5 de mai.". */
export function formatDateInterval(
  from: DateInput,
  to: DateInput,
  language: string
): string {
  const start = toDate(from)
  const end = toDate(to)
  const sameYear =
    start.getFullYear() === new Date().getFullYear() &&
    end.getFullYear() === start.getFullYear()

  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" as const }),
  }).formatRange(start, end)
}

function monthLabel(date: Date, language: string, short: boolean, withYear: boolean) {
  const label = new Intl.DateTimeFormat(language, {
    month: short ? "short" : "long",
    ...(withYear ? { year: "numeric" as const } : {}),
  }).format(date)
  return capitalizeFirstLetter(label)
}

/**
 * Título de período da agenda: "Maio", "Mai / Jun 2027". O ano só aparece quando
 * não é o atual; no celular o mês vem abreviado.
 */
export function formatDateRange(
  date: DateInput,
  {
    range,
    language,
    isMobile = false,
    monthView = false,
  }: {
    range?: { start: DateInput; end: DateInput } | null
    language: string
    isMobile?: boolean
    /** Na visão mensal vale sempre o mês de `date`, nunca o intervalo visível. */
    monthView?: boolean
  }
): string {
  const currentYear = new Date().getFullYear()
  const current = toDate(date)

  if (!monthView && range) {
    const start = toDate(range.start)
    const end = toDate(range.end)
    const sameMonth =
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear()

    if (!sameMonth) {
      const sameYear = start.getFullYear() === end.getFullYear()
      const showYear =
        !sameYear ||
        start.getFullYear() !== currentYear ||
        end.getFullYear() !== currentYear

      const first = monthLabel(start, language, isMobile, showYear && !sameYear)
      const last = monthLabel(end, language, isMobile, showYear)
      return `${first} / ${last}`
    }
  }

  return monthLabel(current, language, isMobile, current.getFullYear() !== currentYear)
}

/** Início do dia local; base dos presets de período e dos filtros por data. */
export function startOfDay(value: DateInput): Date {
  const date = toDate(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Fim do dia local, para o limite superior de um intervalo. */
export function endOfDay(value: DateInput): Date {
  const date = toDate(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

/** "2026-05-12", o formato de `<input type="date">`, no fuso local. */
export function toDateInputValue(value: DateInput): string {
  const date = toDate(value)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** "14:30", o formato de `<input type="time">`, no fuso local. */
export function toTimeInputValue(value: DateInput): string {
  const date = toDate(value)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}
