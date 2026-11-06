import type { SelectOption } from "@/components/shared"

function zoneLabel(zone: string, language: string): { label: string; offset: number } {
  const parts = new Intl.DateTimeFormat(language, {
    timeZone: zone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date())
  // "GMT-03:00"; no meridiano, só "GMT".
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT"
  const match = name.match(/([+-])(\d{2}):(\d{2})/)
  const offset = match
    ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
    : 0
  const city = zone.split("/").slice(1).join(" / ").replaceAll("_", " ") || zone

  return { label: `(${name}) ${city}`, offset }
}

/**
 * Os fusos IANA que o navegador conhece, do oeste para o leste, com o nome da região no
 * apoio. A lista custa alguns milissegundos: guarde em `useMemo`. O fuso atual entra mesmo
 * que o navegador não o liste, para o campo nunca aparecer vazio.
 */
export function timezoneOptions(language: string, current: string | null | undefined): SelectOption[] {
  const known = Intl.supportedValuesOf("timeZone")
  const zones = current && !known.includes(current) ? [current, ...known] : known

  return zones
    .map((zone) => {
      const { label, offset } = zoneLabel(zone, language)
      return {
        offset,
        option: { value: zone, label, description: zone.split("/")[0] } satisfies SelectOption,
      }
    })
    .sort((a, b) => a.offset - b.offset || a.option.label.localeCompare(b.option.label, language))
    .map(({ option }) => option)
}
