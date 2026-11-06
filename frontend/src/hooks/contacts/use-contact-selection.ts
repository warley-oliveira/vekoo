import { useCallback, useMemo, useState } from "react"

import {
  filtersKey,
  type ContactFilters,
  type ContactSelectionTarget,
} from "@/lib/contacts/filters"
import type { Contact } from "@/lib/contacts/types"

type Marks = Record<string, boolean>

const NO_MARKS: Marks = {}

/**
 * A seleção da lista. São dois modos, como na origem: os marcados, que atravessam as páginas,
 * ou todos do filtro menos os desmarcados. O segundo é o que torna possível agir sobre dezenas
 * de milhares sem carregar nenhum id. O `DataTable` só sabe marcar linha, então o mapa que ele
 * enxerga é calculado aqui: no modo "todos", é a página atual menos os desmarcados.
 */
export function useContactSelection(rows: Contact[], total: number, filters: ContactFilters) {
  const [marked, setMarked] = useState<Marks>(NO_MARKS)
  const [allMatching, setAllMatching] = useState(false)
  const [excluded, setExcluded] = useState<Marks>(NO_MARKS)

  const clear = useCallback(() => {
    setMarked(NO_MARKS)
    setExcluded(NO_MARKS)
    setAllMatching(false)
  }, [])

  // Filtro novo, lista nova: os marcados de antes podem nem estar nela.
  const key = filtersKey(filters)
  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) {
    setLastKey(key)
    clear()
  }

  const rowSelection = useMemo<Marks>(() => {
    if (!allMatching) return marked
    return Object.fromEntries(
      rows.filter((row) => !excluded[row.id]).map((row) => [row.id, true])
    )
  }, [allMatching, excluded, marked, rows])

  const onRowSelectionChange = useCallback(
    (next: Marks) => {
      if (!allMatching) {
        setMarked(next)
        return
      }
      setExcluded((current) => {
        const updated = { ...current }
        for (const row of rows) {
          if (next[row.id]) delete updated[row.id]
          else updated[row.id] = true
        }
        return updated
      })
    },
    [allMatching, rows]
  )

  const selectAllMatching = useCallback(() => {
    setMarked(NO_MARKS)
    setExcluded(NO_MARKS)
    setAllMatching(true)
  }, [])

  const togglePage = useCallback(
    (checked: boolean) => {
      const next = { ...rowSelection }
      for (const row of rows) {
        if (checked) next[row.id] = true
        else delete next[row.id]
      }
      onRowSelectionChange(next)
    },
    [onRowSelectionChange, rowSelection, rows]
  )

  const excludedIds = useMemo(() => Object.keys(excluded).filter((id) => excluded[id]), [excluded])
  const markedIds = useMemo(() => Object.keys(marked).filter((id) => marked[id]), [marked])

  const count = allMatching ? Math.max(total - excludedIds.length, 0) : markedIds.length
  const selectedOnPage = rows.filter((row) => rowSelection[row.id]).length

  const target = useMemo<ContactSelectionTarget>(
    () =>
      allMatching
        ? { kind: "all", filters, excluded: excludedIds }
        : { kind: "ids", ids: markedIds },
    [allMatching, excludedIds, filters, markedIds]
  )

  return {
    rowSelection,
    onRowSelectionChange,
    allMatching,
    excludedCount: excludedIds.length,
    count,
    target,
    pageSelected: rows.length > 0 && selectedOnPage === rows.length,
    pagePartlySelected: selectedOnPage > 0 && selectedOnPage < rows.length,
    togglePage,
    selectAllMatching,
    clear,
  }
}

export type ContactSelection = ReturnType<typeof useContactSelection>
