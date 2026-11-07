/** "45 min", "1 h 30 min": a duração com as unidades do idioma, sem montar texto à mão. */
export function formatMinutes(minutes: number, language: string): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts: string[] = []
  if (hours) {
    parts.push(
      new Intl.NumberFormat(language, { style: "unit", unit: "hour", unitDisplay: "narrow" }).format(hours)
    )
  }
  if (rest || !hours) {
    parts.push(
      new Intl.NumberFormat(language, { style: "unit", unit: "minute", unitDisplay: "short" }).format(rest)
    )
  }
  return parts.join(" ")
}
