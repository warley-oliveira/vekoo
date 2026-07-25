import { useState } from "react"

import type { Carousel } from "@/lib/mock-data"

export type SortOption = "recent" | "oldest" | "name-asc" | "name-desc"
export type ViewMode = "grid" | "list"
export type FilterTab = "all" | "recent" | "favorites"

/** Ordem de exibição do seletor; o rótulo vem de `carousels.sort.<option>`. */
export const SORT_OPTIONS: readonly SortOption[] = [
  "recent",
  "oldest",
  "name-asc",
  "name-desc",
]

export function sortCarousels(
  carousels: Carousel[],
  sort: SortOption,
  /** Colação depende do idioma: "ç" e acentos não ordenam igual em toda língua. */
  language = "pt-BR"
): Carousel[] {
  const sorted = [...carousels]
  switch (sort) {
    case "recent":
      return sorted.sort((a, b) => b.editedAt - a.editedAt)
    case "oldest":
      return sorted.sort((a, b) => a.editedAt - b.editedAt)
    case "name-asc":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, language))
    case "name-desc":
      return sorted.sort((a, b) => b.title.localeCompare(a.title, language))
  }
}

/** Estado persistido em localStorage — preferências de visualização sobrevivem ao reload. */
export function usePersistentState<T extends string>(
  key: string,
  initial: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key)
    return (stored as T) ?? initial
  })
  return [
    value,
    (next: T) => {
      setValue(next)
      localStorage.setItem(key, next)
    },
  ]
}
