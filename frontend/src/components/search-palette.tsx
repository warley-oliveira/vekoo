import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Loader2, SearchIcon } from "lucide-react"

import { CardArt } from "@/components/editor/card-art"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useApi } from "@/hooks/use-api"
import { useCarousels } from "@/hooks/use-carousels"
import { cardPlainText, cardTitle } from "@/lib/doc"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import type { CarouselSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

type SearchPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Busca com resultados enquanto digita. Abre por ⌘K / Ctrl+K (registrado no
// AppShell); Esc fecha via Dialog.
//
// Duas camadas, porque a lista em cache traz só o **primeiro card** de cada
// carrossel (é o que a grade desenha):
//
//   1. instantânea, no que já está em memória — título e capa, sem rede;
//   2. depois de 250 ms parada, `?q=` no servidor, que busca em todos os
//      títulos da organização, inclusive os de pastas que a tela nunca abriu.
//
// Buscar dentro do texto de todos os cards é pedido para o backend, não para
// cá: seria carregar a obra inteira no navegador a cada tecla.

const REMOTE_DEBOUNCE = 250
export function SearchPalette({ open, onOpenChange }: SearchPaletteProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { carousels } = useCarousels({})
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setDebounced("")
      setActiveIndex(0)
    }
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setDebounced("")
      return
    }
    const timer = setTimeout(() => setDebounced(trimmed), REMOTE_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [query])

  const { data: remote, isLoading: searching } = useApi<{
    carousels: CarouselSummary[]
  }>(debounced ? `/carousels?q=${encodeURIComponent(debounced)}` : null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    // O que veio do servidor entra junto com o que já estava em memória; o id
    // desempata, para o mesmo carrossel não aparecer duas vezes.
    const pool = new Map<string, CarouselSummary>()
    for (const c of carousels ?? []) pool.set(c.id, c)
    for (const c of remote?.carousels ?? []) pool.set(c.id, c)

    const scored = [...pool.values()]
      .map((carousel) => {
        const inTitle = carousel.title.toLowerCase().includes(q)
        const matchedCard = carousel.cards.find((card) =>
          cardPlainText(card).toLowerCase().includes(q)
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
  }, [query, carousels, remote])

  useEffect(() => {
    setActiveIndex(0)
  }, [results.length])

  function openCarousel(carousel: CarouselSummary) {
    onOpenChange(false)
    const destination = carousel.folderId ? `/folders/${carousel.folderId}` : "/"
    navigate(destination, { state: { highlight: carousel.id } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{t("search.title")}</DialogTitle>
        <div className="flex items-center gap-2.5 border-b px-4">
          {/* Gira só enquanto a busca do servidor está em voo: a camada local
              já respondeu, e um spinner permanente mentiria sobre isso. */}
          {searching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
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
            placeholder={t("search.placeholder")}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            aria-activedescendant={
              results[activeIndex] ? `search-result-${activeIndex}` : undefined
            }
          />
          <kbd className="rounded border bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
            {t("common.esc")}
          </kbd>
        </div>

        {query.trim() === "" ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("search.hint")}
          </p>
        ) : results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("search.noResults", { query: query.trim() })}
          </p>
        ) : (
          <ul
            id="search-results"
            ref={listRef}
            role="listbox"
            aria-label={t("search.resultsAria")}
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
                    <CardArt
                      card={carousel.cards[0]}
                      theme={carousel.theme}
                      format={carousel.format}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{carousel.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {!inTitle && matchedCard
                        ? `“…${cardTitle(matchedCard)}…”`
                        : `${t("carousels.cardCount", {
                            count: carousel.cards.length,
                          })} · ${t("carousels.editedAt", {
                            when: formatRelative(carousel.editedAt, language),
                          })}`}
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
