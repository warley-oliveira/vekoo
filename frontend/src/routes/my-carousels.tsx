import { useEffect, useMemo, useState } from "react"
import { Navigate, useLocation, useNavigate, useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowRight,
  FolderOpen,
  LayoutGrid,
  List,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react"

import { CarouselGridCard } from "@/components/carousel-grid-card"
import {
  CarouselGridSkeleton,
  CarouselTableSkeleton,
} from "@/components/carousel-skeletons"
import { CarouselTable } from "@/components/carousel-table"
import {
  createSuggestions,
  useCreateCarousel,
} from "@/components/create-carousel-dialog"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCarousels } from "@/hooks/use-carousels"
import { useFolders } from "@/hooks/use-folders"
import { useLanguage } from "@/lib/i18n"
import {
  SORT_OPTIONS,
  sortCarousels,
  usePersistentState,
  type FilterTab,
  type SortOption,
  type ViewMode,
} from "@/lib/view-prefs"

const RECENT_WINDOW = 7 * 24 * 3_600_000

// Meus carrosséis — e também a tela de uma pasta aberta (mesma tela, filtrada).
export function MyCarouselsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()

  const [tab, setTab] = useState<FilterTab>("all")
  const [sort, setSort] = usePersistentState<SortOption>("vekoo.view.sort", "recent")
  const [view, setView] = usePersistentState<ViewMode>("vekoo.view.mode", "grid")

  // Destaque vindo da busca: rola até o card e limpa o estado da navegação
  const highlightId = (location.state as { highlight?: string } | null)?.highlight
  useEffect(() => {
    if (!highlightId) return
    const timer = setTimeout(
      () => navigate(location.pathname, { replace: true, state: null }),
      2500
    )
    return () => clearTimeout(timer)
  }, [highlightId, location.pathname, navigate])

  const { folders, isLoading: loadingFolders } = useFolders()
  const folder = params.folderId
    ? folders?.find((f) => f.id === params.folderId)
    : undefined

  // O servidor devolve a pasta já filtrada; abas e ordenação ficam no cliente,
  // que é onde elas são instantâneas.
  const { carousels, isLoading, error, reload } = useCarousels({
    folderId: params.folderId ?? null,
  })

  const filtered = useMemo(() => {
    if (!carousels) return []
    const now = Date.now()
    let result = carousels
    if (tab === "recent") {
      result = result.filter((c) => now - c.editedAt < RECENT_WINDOW)
    } else if (tab === "favorites") {
      result = result.filter((c) => c.favorite)
    }
    return sortCarousels(result, sort, language)
  }, [carousels, tab, sort, language])

  // Pasta apagada / URL inválida → volta para a tela principal. Só depois de a
  // lista de pastas chegar: antes disso, "não achei" quer dizer "ainda não sei".
  if (params.folderId && !loadingFolders && folders && !folder) {
    return <Navigate to="/" replace />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  // Só depois de carregar: avaliar antes faria o convite de primeiro acesso
  // piscar para quem tem catorze carrosséis.
  const isFirstRun = !folder && !isLoading && carousels?.length === 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      {isFirstRun ? (
        <FirstCarouselHero />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
              <TabsList>
                <TabsTrigger value="all">{t("carousels.tabs.all")}</TabsTrigger>
                <TabsTrigger value="recent">
                  {t("carousels.tabs.recent")}
                </TabsTrigger>
                <TabsTrigger value="favorites">
                  {t("carousels.tabs.favorites")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <Select
                value={sort}
                items={Object.fromEntries(
                  SORT_OPTIONS.map((option) => [
                    option,
                    t(`carousels.sort.${option}`),
                  ])
                )}
                onValueChange={(v) => setSort(v as SortOption)}
              >
                <SelectTrigger
                  size="sm"
                  className="w-44"
                  aria-label={t("carousels.sortAria")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`carousels.sort.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <ToggleGroup
                value={[view]}
                onValueChange={(groupValue) => {
                  const next = groupValue[0] as ViewMode | undefined
                  if (next) setView(next)
                }}
              >
                <ToggleGroupItem value="grid" aria-label={t("carousels.viewGrid")}>
                  <LayoutGrid />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label={t("carousels.viewList")}>
                  <List />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {isLoading && !carousels ? (
            view === "grid" ? (
              <CarouselGridSkeleton />
            ) : (
              <CarouselTableSkeleton />
            )
          ) : filtered.length === 0 ? (
            <FilteredEmptyState tab={tab} isFolder={!!folder} />
          ) : view === "grid" ? (
            <motion.div
              layout={!reducedMotion}
              className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4"
            >
              <AnimatePresence initial={false}>
                {filtered.map((carousel) => (
                  <motion.div
                    key={carousel.id}
                    layout={!reducedMotion}
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={
                      reducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, scale: 0.97 }
                    }
                    transition={{ duration: 0.18 }}
                  >
                    <CarouselGridCard
                      carousel={carousel}
                      highlighted={carousel.id === highlightId}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <CarouselTable
              carousels={filtered}
              sort={sort}
              onSortChange={setSort}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ---------- estados vazios ---------- */

// Primeiro acesso sem nenhum carrossel: não é um aviso triste — é o começo
// do trabalho, com o campo de descrever já disponível.
function FirstCarouselHero() {
  const { t } = useTranslation()
  const { create, creating } = useCreateCarousel()
  const [idea, setIdea] = useState("")
  const valid = idea.trim().length > 0 && !creating

  async function submit() {
    if (!valid) return
    // Só limpa o campo se o carrossel nasceu: falhar e apagar o que a pessoa
    // escreveu seria perder o trabalho dela por causa da rede.
    if (await create(idea.trim())) setIdea("")
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center pt-14 text-center">
      <h2 className="font-heading text-3xl font-bold tracking-tight text-balance">
        {t("carousels.hero.title")}
      </h2>
      <p className="mt-2 text-muted-foreground">
        {t("carousels.hero.subtitle")}
      </p>

      <div className="mt-6 w-full">
        <div className="flex items-start gap-2 rounded-xl border bg-card p-2 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <textarea
            autoFocus
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={2}
            placeholder={t("carousels.hero.placeholder")}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button
            size="icon"
            disabled={!valid}
            onClick={submit}
            aria-label={t("carousels.hero.submitAria")}
          >
            {creating ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {createSuggestions().map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setIdea(suggestion)}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors outline-none hover:border-ring/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function FilteredEmptyState({ tab, isFolder }: { tab: FilterTab; isFolder: boolean }) {
  const { t } = useTranslation()

  if (isFolder && tab === "all") {
    return (
      <EmptyState
        icon={<FolderOpen className="size-6" />}
        title={t("carousels.empty.folderTitle")}
        description={t("carousels.empty.folderDescription")}
      />
    )
  }
  if (tab === "favorites") {
    return (
      <EmptyState
        icon={<Star className="size-6" />}
        title={t("carousels.empty.favoritesTitle")}
        description={t("carousels.empty.favoritesDescription")}
      />
    )
  }
  return (
    <EmptyState
      icon={<Sparkles className="size-6" />}
      title={t("carousels.empty.recentTitle")}
      description={t("carousels.empty.recentDescription")}
    />
  )
}
