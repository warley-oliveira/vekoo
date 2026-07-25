import { useState } from "react"

import type { Carousel } from "@/lib/mock-data"

export type SortOption = "recent" | "oldest" | "name-asc" | "name-desc"
export type ViewMode = "grid" | "list"
export type FilterTab = "todos" | "recentes" | "favoritos"

export const SORT_LABELS: Record<SortOption, string> = {
  recent: "Editados por último",
  oldest: "Mais antigos",
  "name-asc": "Nome (A–Z)",
  "name-desc": "Nome (Z–A)",
}

export function sortCarousels(carousels: Carousel[], sort: SortOption): Carousel[] {
  const sorted = [...carousels]
  switch (sort) {
    case "recent":
      return sorted.sort((a, b) => b.editedAt - a.editedAt)
    case "oldest":
      return sorted.sort((a, b) => a.editedAt - b.editedAt)
    case "name-asc":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"))
    case "name-desc":
      return sorted.sort((a, b) => b.title.localeCompare(a.title, "pt-BR"))
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
