import { useEffect, useState } from "react"

import type { ColumnChoice, MappedSummary } from "@/lib/campaigns-wizard/import-protocol"

/** O mapeamento no worker: cada troca de coluna reconfere o arquivo inteiro, sem passar pela tela. */
export function useColumnMapping(
  mapColumns: (columns: ColumnChoice, includeCountryCode: boolean) => Promise<MappedSummary>,
  active: boolean
) {
  const [columns, setColumns] = useState<ColumnChoice>({ name: null, phone: null })
  // Base brasileira: quase sempre o número vem sem o 55.
  const [includeCountryCode, setIncludeCountryCode] = useState(true)
  const [mapped, setMapped] = useState<MappedSummary | null>(null)
  const [mapping, setMapping] = useState(false)

  const ready = Boolean(columns.name && columns.phone) && columns.name !== columns.phone

  useEffect(() => {
    if (!active || !ready) return

    let current = true
    setMapping(true)
    mapColumns(columns, includeCountryCode)
      .then((result) => {
        if (current) setMapped(result)
      })
      .catch(() => {
        if (current) setMapped(null)
      })
      .finally(() => {
        if (current) setMapping(false)
      })

    return () => {
      current = false
    }
  }, [active, columns, includeCountryCode, mapColumns, ready])

  return {
    columns,
    setColumns,
    includeCountryCode,
    setIncludeCountryCode,
    mapped: ready ? mapped : null,
    mapping,
    ready,
  }
}
