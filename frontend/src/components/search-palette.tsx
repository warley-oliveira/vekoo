import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { CornerDownRight, Loader2, SearchIcon, type LucideIcon } from "lucide-react"

import { CardArt } from "@/components/editor/card-art"
import { UserAvatar } from "@/components/shared"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useApi } from "@/hooks/use-api"
import { useCan, useCanAccess } from "@/hooks/use-can"
import { useCarousels } from "@/hooks/use-carousels"
import { useNavigation } from "@/hooks/use-navigation"
import { apiAssetUrl } from "@/lib/api"
import { contactLine } from "@/lib/calendar/contact"
import type { ChatLookupItem } from "@/lib/calendar/types"
import { cardPlainText, cardTitle } from "@/lib/doc"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { SEARCH_SHORTCUTS } from "@/lib/navigation"
import { matchesSearch } from "@/lib/search-text"
import type { CarouselSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

type SearchPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SearchGroup = "pages" | "contacts" | "carousels"

/** Uma linha de resultado: o que desenhar e para onde levar. */
type SearchItem = {
  id: string
  group: SearchGroup
  title: string
  detail?: string
  leading: ReactNode
  go: () => void
}

// A busca do produto inteiro, com resultados enquanto digita. Abre por ⌘K / Ctrl+K (registrado no
// AppShell); Esc fecha via Dialog.
//
// - **Telas:** o menu e os atalhos, filtrados pela permissão de quem busca. Sem rede.
// - **Contatos:** `GET /chats/lookup`, que já respeita o que a pessoa pode ver no chat.
// - **Carrosséis:** em duas camadas, porque a lista em cache traz só o **primeiro card** de cada um
//   (é o que a grade desenha): instantânea no que está em memória, e, depois de 250 ms parada, `?q=`
//   no servidor, que busca em todos os títulos da organização, inclusive os de pastas que a tela nunca
//   abriu. Buscar dentro do texto de todos os cards é pedido para o backend, não para cá: seria
//   carregar a obra inteira no navegador a cada tecla.

const REMOTE_DEBOUNCE = 250
const GROUP_ORDER: SearchGroup[] = ["pages", "contacts", "carousels"]
const MAX_PAGES = 5
const MAX_CONTACTS = 5
const MAX_CAROUSELS = 6

export function SearchPalette({ open, onOpenChange }: SearchPaletteProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { carousels } = useCarousels({})
  const { groups: navGroups } = useNavigation()
  const can = useCanAccess()
  const canChat = useCan("chat")
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

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

  const { data: remote, isLoading: searchingCarousels } = useApi<{
    carousels: CarouselSummary[]
  }>(debounced ? `/carousels?q=${encodeURIComponent(debounced)}` : null)

  const { data: lookup, isLoading: searchingContacts } = useApi<{ chats: ChatLookupItem[] }>(
    debounced && canChat ? `/chats/lookup?q=${encodeURIComponent(debounced)}` : null
  )

  const searching = searchingCarousels || searchingContacts

  function leave(path: string, state?: unknown) {
    onOpenChange(false)
    navigate(path, state ? { state } : undefined)
  }

  // Tudo o que dá para abrir direto: as áreas do menu, os filhos delas e os atalhos que não têm linha
  // no menu, como o próprio perfil.
  const pages = useMemo(() => {
    const list: { id: string; title: string; parent?: string; to: string; icon: LucideIcon }[] = []
    for (const group of navGroups) {
      for (const entry of group.entries) {
        const parent = t(entry.titleKey)
        if (entry.to) list.push({ id: entry.id, title: parent, to: entry.to, icon: entry.icon })
        for (const child of entry.children ?? []) {
          const title = child.title ?? (child.titleKey ? t(child.titleKey) : "")
          list.push({ id: child.id, title, parent, to: child.to, icon: entry.icon })
        }
      }
    }
    for (const shortcut of SEARCH_SHORTCUTS) {
      if (can(shortcut.permission)) {
        list.push({
          id: shortcut.id,
          title: t(shortcut.titleKey),
          parent: shortcut.parentKey ? t(shortcut.parentKey) : undefined,
          to: shortcut.to,
          icon: CornerDownRight,
        })
      }
    }
    return list
  }, [can, navGroups, t])

  const items = useMemo<SearchItem[]>(() => {
    const trimmed = query.trim()
    if (!trimmed) return []

    const pageItems: SearchItem[] = pages
      .filter((page) => matchesSearch(page.title, trimmed))
      .slice(0, MAX_PAGES)
      .map((page) => ({
        id: `page-${page.id}`,
        group: "pages",
        title: page.title,
        detail: page.parent,
        leading: (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <page.icon className="size-4" aria-hidden />
          </span>
        ),
        go: () => leave(page.to),
      }))

    // Só vale o que veio para a busca de agora: a resposta anterior continuaria na tela até a próxima chegar.
    const contactItems: SearchItem[] = (debounced === trimmed ? (lookup?.chats ?? []) : [])
      .slice(0, MAX_CONTACTS)
      .map((chat) => {
        const name = chat.displayName || chat.userName || contactLine(chat.externalId) || t("search.unnamedContact")
        return {
          id: `contact-${chat.id}`,
          group: "contacts",
          title: name,
          detail: contactLine(chat.externalId),
          leading: (
            <UserAvatar
              name={name}
              src={chat.profilePictureUrl ? apiAssetUrl(chat.profilePictureUrl) : null}
            />
          ),
          go: () => leave(`/chat/${chat.id}`),
        }
      })

    // O que veio do servidor entra junto com o que já estava em memória; o id desempata, para o mesmo
    // carrossel não aparecer duas vezes.
    const pool = new Map<string, CarouselSummary>()
    for (const carousel of carousels ?? []) pool.set(carousel.id, carousel)
    for (const carousel of remote?.carousels ?? []) pool.set(carousel.id, carousel)

    const q = trimmed.toLowerCase()
    const carouselItems: SearchItem[] = [...pool.values()]
      .map((carousel) => {
        const inTitle = carousel.title.toLowerCase().includes(q)
        const matchedCard = carousel.cards.find((card) => cardPlainText(card).toLowerCase().includes(q))
        return !inTitle && !matchedCard ? null : { carousel, inTitle, matchedCard }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      // título antes de conteúdo; entre iguais, edição mais recente primeiro
      .sort((a, b) =>
        a.inTitle === b.inTitle ? b.carousel.editedAt - a.carousel.editedAt : a.inTitle ? -1 : 1
      )
      .slice(0, MAX_CAROUSELS)
      .map(({ carousel, inTitle, matchedCard }) => ({
        id: `carousel-${carousel.id}`,
        group: "carousels",
        title: carousel.title,
        detail:
          !inTitle && matchedCard
            ? `“…${cardTitle(matchedCard)}…”`
            : `${t("carousels.cardCount", { count: carousel.cardCount })} · ${t("carousels.editedAt", {
                when: formatRelative(carousel.editedAt, language),
              })}`,
        leading: (
          <div className="w-9 shrink-0">
            <CardArt card={carousel.cards[0]} theme={carousel.theme} format={carousel.format} />
          </div>
        ),
        go: () =>
          leave(carousel.folderId ? `/folders/${carousel.folderId}` : "/carousels", {
            highlight: carousel.id,
          }),
      }))

    return [...pageItems, ...contactItems, ...carouselItems]
    // `leave` só fecha e navega: não muda o resultado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carousels, debounced, language, lookup, pages, query, remote, t])

  useEffect(() => {
    setActiveIndex(0)
  }, [items.length])

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    rows: items.filter((item) => item.group === group),
  })).filter((section) => section.rows.length > 0)

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
                setActiveIndex((i) => Math.min(i + 1, items.length - 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setActiveIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === "Enter" && items[activeIndex]) {
                items[activeIndex].go()
              }
            }}
            placeholder={t("search.placeholder")}
            aria-label={t("search.title")}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="search-results"
            aria-activedescendant={items[activeIndex] ? `search-result-${items[activeIndex].id}` : undefined}
          />
          <kbd className="rounded border bg-muted px-1.5 py-px text-[11px] text-muted-foreground pointer-coarse:hidden">
            {t("common.esc")}
          </kbd>
        </div>

        {query.trim() === "" ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("search.hint")}</p>
        ) : items.length === 0 ? (
          // A busca ainda em voo não é "nada encontrado": o giro no campo já diz que está procurando.
          searching || debounced !== query.trim() ? null : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("search.noResults", { query: query.trim() })}
            </p>
          )
        ) : (
          <div
            id="search-results"
            role="listbox"
            aria-label={t("search.resultsAria")}
            className="max-h-[min(24rem,60dvh)] overflow-y-auto p-1.5"
          >
            {grouped.map(({ group, rows }) => (
              <div key={group} role="group" aria-label={t(`search.groups.${group}`)}>
                <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                  {t(`search.groups.${group}`)}
                </p>
                {rows.map((item) => {
                  const index = items.indexOf(item)
                  return (
                    <button
                      key={item.id}
                      id={`search-result-${item.id}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      type="button"
                      onClick={item.go}
                      onMouseMove={() => setActiveIndex(index)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none",
                        index === activeIndex && "bg-accent"
                      )}
                    >
                      {item.leading}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {item.detail ? (
                          <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
