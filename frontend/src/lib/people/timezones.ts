import type { SelectOption } from "@/components/shared"

/** O id IANA não tem acento: "Sao_Paulo". Nome de cidade, igual em qualquer idioma. */
const CITY_NAMES: Record<string, string> = {
  "America/Sao_Paulo": "São Paulo",
  "America/Araguaina": "Araguaína",
  "America/Belem": "Belém",
  "America/Cuiaba": "Cuiabá",
  "America/Eirunepe": "Eirunepé",
  "America/Maceio": "Maceió",
  "America/Santarem": "Santarém",
}

function zoneLabel(zone: string, language: string): { label: string; offset: number } {
  const city = CITY_NAMES[zone] ?? (zone.split("/").slice(1).join(" / ").replaceAll("_", " ") || zone)

  try {
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

    return { label: `(${name}) ${city}`, offset }
  } catch {
    // Navegador antigo, sem `longOffset`, ou fuso que ele não conhece: fica só o nome.
    return { label: city, offset: 0 }
  }
}

/**
 * Os fusos IANA que o navegador conhece, do oeste para o leste, com o nome da região no
 * apoio. A lista custa alguns milissegundos: guarde em `useMemo`. O fuso atual entra mesmo
 * que o navegador não o liste, para o campo nunca aparecer vazio.
 */
export function timezoneOptions(language: string, current: string | null | undefined): SelectOption[] {
  // Sem a lista (navegador antigo), o campo oferece ao menos o fuso que já está gravado.
  const known = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []
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
