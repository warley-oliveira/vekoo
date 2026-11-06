import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router"
import { Archive, SearchX } from "lucide-react"
import { toast } from "sonner"

import {
  AreaNav,
  Callout,
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
  type AreaNavItem,
  type PageBodyProps,
  type PageHeaderProps,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useBoard, useBoardMutations, useRevalidateBoard } from "@/hooks/pipelines-admin/use-board"
import { useDebouncedCallback } from "@/hooks/use-debounced-value"
import { useChannel } from "@/hooks/use-channel"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { ApiError } from "@/lib/api"
import { hasGoals } from "@/lib/pipelines-admin/board-rules"
import { adminErrorMessage } from "@/lib/pipelines-admin/error-message"
import type { Board } from "@/lib/pipelines-admin/types"

export type BoardArea =
  | "settings"
  | "triggers"
  | "goals"
  | "fields"
  | "labels"
  | "metrics"
  | "archived"

type BoardFrameProps = {
  area: BoardArea
  variant?: PageBodyProps["variant"]
  /** Espelha a tela enquanto o quadro carrega. */
  skeleton: ReactNode
  /** Frase de apoio, ações na barra superior. Pode depender do quadro. */
  header?: (board: Board) => Pick<
    PageHeaderProps,
    "description" | "actions" | "mobileActions" | "mobilePlacement"
  >
  children: (board: Board) => ReactNode
}

// O que muda a estrutura do quadro. Os eventos de card chegam a toda hora e não mudam nada aqui.
const STRUCTURE_EVENTS = new Set([
  "stage_created",
  "stage_updated",
  "stage_deleted",
  "stages_reordered",
  "custom_fields_changed",
  "card_visibility_changed",
])

const LIVE_REFRESH_DELAY_MS = 400

/**
 * A moldura de toda tela de administração de um quadro: lê o quadro, cuida de não encontrado e de
 * erro, põe o nome e o voltar na barra superior, as abas da área e o recado de quadro arquivado.
 */
export function BoardFrame({ area, variant, skeleton, header, children }: BoardFrameProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { boardId } = useParams<{ boardId: string }>()
  const { board, error, isLoading, reload } = useBoard(boardId)
  const revalidate = useRevalidateBoard(boardId ?? "")

  const refreshSoon = useDebouncedCallback(() => void revalidate(), LIVE_REFRESH_DELAY_MS)

  // Outro gerente mexendo no mesmo quadro: etapa nova, campo renomeado, regra de visibilidade.
  useChannel<{ event?: string }>(boardId ? "PipelineBoardChannel" : null, { boardId }, (message) => {
    if (message?.event && STRUCTURE_EVENTS.has(message.event)) refreshSoon()
  })

  if (error && !board) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <PageBody>
          <EmptyState
            icon={<SearchX className="size-5" />}
            title={t("pipelinesAdmin.frame.notFound.title")}
            description={t("pipelinesAdmin.frame.notFound.description")}
            action={{
              label: t("pipelinesAdmin.frame.notFound.action"),
              onClick: () => navigate("/pipelines"),
            }}
          />
        </PageBody>
      )
    }
    return (
      <PageBody>
        <ErrorState error={error} onRetry={() => void reload()} />
      </PageBody>
    )
  }

  if (isLoading || !board) {
    return <PageBody variant={variant}>{skeleton}</PageBody>
  }

  const headerProps = header?.(board)

  return (
    <PageBody variant={variant}>
      <BoardAreaNav board={board} />
      <PageHeader
        title={board.name}
        backTo={`/pipelines/${board.id}`}
        parentTitle={t("navigation.pipelines")}
        {...headerProps}
      />
      <AreaTitle area={area} boardName={board.name} />
      {board.archived ? <ArchivedNotice board={board} /> : null}
      {children(board)}
    </PageBody>
  )
}

function AreaTitle({ area, boardName }: { area: BoardArea; boardName: string }) {
  const { t } = useTranslation()
  useDocumentTitle(`${t(`pipelinesAdmin.routes.${area}`)} · ${boardName}`)
  return null
}

function BoardAreaNav({ board }: { board: Board }) {
  const { t } = useTranslation()

  const items = useMemo<AreaNavItem[]>(() => {
    const base = `/pipelines/${board.id}`
    return [
      { to: `${base}/settings`, label: t("pipelinesAdmin.nav.settings") },
      { to: `${base}/settings/triggers`, label: t("pipelinesAdmin.nav.triggers") },
      ...(hasGoals(board)
        ? [{ to: `${base}/settings/goals`, label: t("pipelinesAdmin.nav.goals") }]
        : []),
      { to: `${base}/settings/fields`, label: t("pipelinesAdmin.nav.fields") },
      { to: `${base}/settings/labels`, label: t("pipelinesAdmin.nav.labels") },
      { to: `${base}/metrics`, label: t("pipelinesAdmin.nav.metrics") },
      { to: `${base}/archived`, label: t("pipelinesAdmin.nav.archived") },
    ]
  }, [board, t])

  // Cada tela monta a sua barra, que nasce rolada para o começo. Em tela estreita, a aba ativa ficaria
  // fora da vista. Mexe só no `scrollLeft`: `scrollIntoView` poderia rolar a página junto.
  const wrapper = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const nav = wrapper.current?.querySelector("nav")
    const active = nav?.querySelector('[aria-current="page"]')
    if (!nav || !active) return
    const navBox = nav.getBoundingClientRect()
    const activeBox = active.getBoundingClientRect()
    nav.scrollLeft += activeBox.left - navBox.left - (navBox.width - activeBox.width) / 2
  }, [])

  return (
    <div ref={wrapper} className="contents">
      <AreaNav label={t("pipelinesAdmin.nav.aria", { name: board.name })} items={items} />
    </div>
  )
}

function ArchivedNotice({ board }: { board: Board }) {
  const { t } = useTranslation()
  const { archiveBoard } = useBoardMutations(board.id)

  async function unarchive() {
    try {
      await archiveBoard(true)
      toast.success(t("pipelinesAdmin.settings.danger.unarchived", { name: board.name }))
    } catch (cause) {
      toast.error(adminErrorMessage(t, cause))
    }
  }

  return (
    <Callout
      tone="warning"
      icon={<Archive />}
      title={t("pipelinesAdmin.frame.archived.title")}
      action={
        <Button variant="outline" size="sm" onClick={() => void unarchive()} className="pointer-coarse:h-10">
          {t("pipelinesAdmin.settings.danger.unarchive")}
        </Button>
      }
    >
      {t("pipelinesAdmin.frame.archived.description")}
    </Callout>
  )
}
