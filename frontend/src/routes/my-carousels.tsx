import { useEffect, useMemo, useState } from "react"
import { Navigate, useLocation, useNavigate, useParams } from "react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowRight,
  FolderOpen,
  LayoutGrid,
  List,
  Sparkles,
  Star,
} from "lucide-react"

import { CarouselGridCard } from "@/components/carousel-grid-card"
import { CarouselTable } from "@/components/carousel-table"
import {
  CREATE_SUGGESTIONS,
  submitCreateIdea,
} from "@/components/create-carousel-dialog"
import { EmptyState } from "@/components/empty-state"
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
import { useStore } from "@/lib/store"
import {
  SORT_LABELS,
  sortCarousels,
  usePersistentState,
  type FilterTab,
  type SortOption,
  type ViewMode,
} from "@/lib/view-prefs"

const RECENT_WINDOW = 7 * 24 * 3_600_000

// Meus carrosséis — e também a tela de uma pasta aberta (mesma tela, filtrada).
export function MyCarouselsPage() {
  const { state } = useStore()
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()

  const [tab, setTab] = useState<FilterTab>("todos")
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

  const folder = params.folderId
    ? state.folders.find((f) => f.id === params.folderId)
    : undefined

  const active = useMemo(
    () => state.carousels.filter((c) => c.trashedAt === null),
    [state.carousels]
  )
  const inScope = folder ? active.filter((c) => c.folderId === folder.id) : active

  const filtered = useMemo(() => {
    const now = Date.now()
    let result = inScope
    if (tab === "recentes") {
      result = result.filter((c) => now - c.editedAt < RECENT_WINDOW)
    } else if (tab === "favoritos") {
      result = result.filter((c) => c.favorite)
    }
    return sortCarousels(result, sort)
  }, [inScope, tab, sort])

  // Pasta apagada / URL inválida → volta para a tela principal
  if (params.folderId && !folder) return <Navigate to="/" replace />

  const isFirstRun = !folder && active.length === 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      {isFirstRun ? (
        <FirstCarouselHero />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
              <TabsList>
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="recentes">Recentes</TabsTrigger>
                <TabsTrigger value="favoritos">Favoritos</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <Select
                value={sort}
                onValueChange={(v) => setSort(v as SortOption)}
              >
                <SelectTrigger
                  size="sm"
                  className="w-44"
                  aria-label="Ordenar por"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                    <SelectItem key={option} value={option}>
                      {SORT_LABELS[option]}
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
                <ToggleGroupItem value="grid" aria-label="Ver em grade">
                  <LayoutGrid />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="Ver em lista">
                  <List />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {filtered.length === 0 ? (
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
  const [idea, setIdea] = useState("")
  const valid = idea.trim().length > 0

  function submit() {
    if (!valid) return
    submitCreateIdea(idea.trim())
    setIdea("")
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center pt-14 text-center">
      <h2 className="font-heading text-3xl font-bold tracking-tight text-balance">
        Sobre o que é o seu primeiro carrossel?
      </h2>
      <p className="mt-2 text-muted-foreground">
        Descreva o assunto em uma frase — o Vekoo monta os cards para você.
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
            placeholder="Ex.: 5 erros comuns de quem começa a treinar em casa"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button size="icon" disabled={!valid} onClick={submit} aria-label="Criar carrossel">
            <ArrowRight />
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {CREATE_SUGGESTIONS.map((suggestion) => (
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
  if (isFolder && tab === "todos") {
    return (
      <EmptyState
        icon={<FolderOpen className="size-6" />}
        title="Esta pasta ainda está vazia"
        description="Arraste um carrossel até ela no menu lateral, ou use “Mover para pasta” no menu de ações."
      />
    )
  }
  if (tab === "favoritos") {
    return (
      <EmptyState
        icon={<Star className="size-6" />}
        title="Nenhum favorito ainda"
        description="Passe o mouse sobre um carrossel e toque na estrela para achá-lo rapidinho depois."
      />
    )
  }
  return (
    <EmptyState
      icon={<Sparkles className="size-6" />}
      title="Nada editado nos últimos 7 dias"
      description="Os carrosséis que você editar recentemente aparecem aqui."
    />
  )
}
