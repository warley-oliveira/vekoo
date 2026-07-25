import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { SearchIcon } from "lucide-react"

import { CarouselCover } from "@/components/carousel-cover"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { formatCardCount, formatRelative } from "@/lib/format"
import type { Carousel } from "@/lib/mock-data"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

type SearchPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Busca por título e pelo conteúdo dos cards, com resultados enquanto digita.
// Abre por ⌘K / Ctrl+K (registrado no AppShell); Esc fecha via Dialog.
export function SearchPalette({ open, onOpenChange }: SearchPaletteProps) {
  const { state } = useStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
    }
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const active = state.carousels.filter((c) => c.trashedAt === null)
    const scored = active
      .map((carousel) => {
        const inTitle = carousel.title.toLowerCase().includes(q)
        const matchedCard = carousel.cards.find(
          (card) =>
            card.title.toLowerCase().includes(q) ||
            card.body.toLowerCase().includes(q)
        )
        if (!inTitle && !matchedCard) return null
        return { carousel, inTitle, matchedCard }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
    // título antes de conteúdo; entre iguais, edição mais recente primeiro
    scored.sort((a, b) =>
      a.inTitle === b.inTitle
        ? b.carousel.editedAt - a.carousel.editedAt
        : a.inTitle
          ? -1
          : 1
    )
    return scored.slice(0, 8)
  }, [query, state.carousels])

  useEffect(() => {
    setActiveIndex(0)
  }, [results.length])

  function openCarousel(carousel: Carousel) {
    onOpenChange(false)
    const destination = carousel.folderId ? `/pastas/${carousel.folderId}` : "/"
    navigate(destination, { state: { highlight: carousel.id } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Buscar carrosséis</DialogTitle>
        <div className="flex items-center gap-2.5 border-b px-4">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setActiveIndex((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setActiveIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === "Enter" && results[activeIndex]) {
                openCarousel(results[activeIndex].carousel)
              }
            }}
            placeholder="Buscar por título ou conteúdo dos cards…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            aria-activedescendant={
              results[activeIndex] ? `search-result-${activeIndex}` : undefined
            }
          />
          <kbd className="rounded border bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        {query.trim() === "" ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Digite para buscar nos seus carrosséis.
          </p>
        ) : results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nada encontrado para “{query.trim()}”.
          </p>
        ) : (
          <ul
            id="search-results"
            ref={listRef}
            role="listbox"
            aria-label="Resultados da busca"
            className="max-h-80 overflow-y-auto p-1.5"
          >
            {results.map(({ carousel, matchedCard, inTitle }, index) => (
              <li key={carousel.id} role="presentation">
                <button
                  id={`search-result-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  type="button"
                  onClick={() => openCarousel(carousel)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none",
                    index === activeIndex && "bg-accent"
                  )}
                >
                  <div className="w-9 shrink-0">
                    <CarouselCover cover={carousel.cover} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{carousel.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {!inTitle && matchedCard
                        ? `“…${matchedCard.title}…”`
                        : `${formatCardCount(carousel.cards.length)} · editado ${formatRelative(carousel.editedAt)}`}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
