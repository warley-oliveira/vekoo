import { createContext, createElement, useContext, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useSWRConfig } from "swr"
import { toast } from "sonner"

import { PendingList } from "@/components/pipelines/pending-list"
import { useConfirm } from "@/components/shared"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api"
import {
  findCard,
  fullListIndex,
  patchCard,
  placeCard,
  removeCard,
  upsertCard,
} from "@/lib/pipelines/board-state"
import { pendingFrom, pipelineErrorText } from "@/lib/pipelines/errors"
import { captureCardPosition } from "@/lib/pipelines/flip"
import { boardPath, cardPath, cardsPath } from "@/lib/pipelines/paths"
import type { BoardDetail, Card, CardDetail, CardPriority } from "@/lib/pipelines/types"
import { clearPending, markPending, type BoardHandle } from "./board-handle"
import { useBoardUi } from "./use-board-ui"

/** O que `PATCH /cards/:id` aceita. `labelIds` substitui a lista. */
export type CardPatch = Partial<{
  title: string
  description: string | null
  descriptionJson: Record<string, unknown> | null
  priority: CardPriority | null
  status: string | null
  dueDate: number | null
  assignedToId: string | null
  chatId: string | null
  tags: string[]
  colorLabel: string | null
  customFieldValues: Record<string, unknown>
  dealValue: number | null
  dealProbability: number | null
  companyName: string | null
  contactEmail: string | null
  contactPhone: string | null
  expectedCloseDate: string | null
  labelIds: string[]
}>

export type BulkUpdateInput = Partial<{
  assignedToId: string | null
  priority: CardPriority | null
  archived: boolean
}>

export type DropTarget = {
  cardId: string
  toStageId: string
  /** O vizinho de cima e o de baixo, na lista que a pessoa estava vendo. */
  previousId: string | null
  nextId: string | null
}

export type CardActions = ReturnType<typeof useCardActionsValue>

const MAX_REORDER_IDS = 2_000

/** O card que volta numa escrita traz a descrição rica, que pesa e não fica no quadro. */
function forBoard(card: CardDetail | Card): Card {
  const { descriptionJson: _descriptionJson, ...rest } = card as CardDetail
  return rest
}

/**
 * Tudo que muda um card. Otimista onde a pessoa espera resposta na hora, e com volta quando a API
 * recusa. O objeto devolvido é estável: pode ir num contexto sem redesenhar os cards.
 */
function useCardActionsValue(
  handle: BoardHandle,
  navigation: { open: (cardId: string) => void; close: () => void }
) {
  const { t } = useTranslation()
  const { mutate } = useSWRConfig()
  const confirm = useConfirm()

  const latest = useRef({ t, mutate, confirm, navigation })
  latest.current = { t, mutate, confirm, navigation }

  return useMemo(() => {
    const { boardId } = handle
    const translate = (...args: Parameters<typeof t>) => latest.current.t(...args)

    const detailKey = (cardId: string) => cardPath(boardId, cardId)

    const mutateDetail = (cardId: string, update: (detail: CardDetail) => CardDetail) =>
      latest.current.mutate<CardDetail>(
        detailKey(cardId),
        (current) => (current ? update(current) : current),
        { revalidate: false }
      )

    /** A lista é paginada no servidor: quem sabe o que entra nela é ele. */
    const reloadList = () =>
      latest.current.mutate(
        (key) => typeof key === "string" && key.startsWith(`${cardsPath(boardId)}?`)
      )

    const applyServerCard = (card: CardDetail | Card) => {
      const clean = forBoard(card)
      handle.mutateBoard((board) => upsertCard(board, clean))
      void mutateDetail(card.id, (detail) => ({ ...detail, ...card }))
      void reloadList()
    }

    const reportMoveFailure = (error: unknown, cardId: string) => {
      const pending = pendingFrom(error)
      const text = translate("pipelines.errors.moveFailed")
      if (!pending) {
        toast.error(pipelineErrorText(latest.current.t, error, "pipelines.errors.moveFailed"))
        return
      }

      useBoardUi.getState().markBlocked(cardId, pending.items)
      const title =
        pending.code === "checklistIncomplete"
          ? translate("pipelines.move.checklistIncomplete")
          : translate("pipelines.move.requiredFieldsIncomplete")

      toast.warning(title || text, {
        duration: 8_000,
        description:
          pending.items.length > 0 ? createElement(PendingList, { items: pending.items }) : undefined,
        action: {
          label: translate("pipelines.move.openCard"),
          onClick: () => latest.current.navigation.open(cardId),
        },
      })
    }

    /** O que está na etapa de verdade, sem o filtro avançado. */
    const fullIdsOf = async (stageId: string): Promise<string[]> => {
      const board = handle.isServerFiltered()
        ? await apiGet<BoardDetail>(boardPath(boardId))
        : handle.getBoard()
      const stage = board?.stages.find((candidate) => candidate.id === stageId)
      return stage ? stage.cards.map((card) => card.id) : []
    }

    const actions = {
      open: (cardId: string) => latest.current.navigation.open(cardId),
      close: () => latest.current.navigation.close(),

      create: async (stageId: string, title: string, extra?: CardPatch) => {
        const card = await apiPost<CardDetail>(cardsPath(boardId), {
          card: { stageId, title, ...extra },
        })
        useBoardUi.getState().markFresh(card.id)
        handle.mutateBoard((board) => upsertCard(board, forBoard(card)))
        void reloadList()
        return card
      },

      update: async (cardId: string, patch: CardPatch, optimistic?: Partial<Card>) => {
        markPending(handle, cardId)
        if (optimistic) {
          handle.mutateBoard((board) => patchCard(board, cardId, optimistic))
          void mutateDetail(cardId, (detail) => ({ ...detail, ...optimistic }))
        }
        try {
          const card = await apiPatch<CardDetail>(detailKey(cardId), { card: patch })
          applyServerCard(card)
          return card
        } catch (error) {
          handle.revalidate()
          void latest.current.mutate(detailKey(cardId))
          toast.error(pipelineErrorText(latest.current.t, error, "pipelines.errors.saveFailed"))
          throw error
        } finally {
          clearPending(handle, cardId)
        }
      },

      /** Soltar o card: a mesma ação para o arrastar e para o teclado. */
      drop: async ({ cardId, toStageId, previousId, nextId }: DropTarget) => {
        const board = handle.getBoard()
        if (!board) return
        const before = findCard(board, cardId)
        if (!before) return

        const target = board.stages.find((stage) => stage.id === toStageId)
        const sameStage = before.stage.id === toStageId
        const shownIds = target ? target.cards.map((card) => card.id) : []

        markPending(handle, cardId)
        handle.mutateBoard((current) =>
          placeCard(current, cardId, toStageId, fullListIndex(shownIds, cardId, previousId, nextId))
        )

        try {
          const fullIds = await fullIdsOf(toStageId)
          const index = fullListIndex(fullIds, cardId, previousId, nextId)

          if (sameStage && fullIds.length <= MAX_REORDER_IDS) {
            const orderedIds = fullIds.filter((id) => id !== cardId)
            orderedIds.splice(index, 0, cardId)
            await apiPost(`${cardsPath(boardId)}/reorder`, { stageId: toStageId, orderedIds })
          } else {
            const card = await apiPost<CardDetail>(`${detailKey(cardId)}/move`, {
              stageId: toStageId,
              position: index + 1,
            })
            applyServerCard(card)
          }
        } catch (error) {
          handle.mutateBoard((current) =>
            placeCard(current, cardId, before.stage.id, before.index, {
              stageEnteredAt: before.card.stageEnteredAt,
            })
          )
          reportMoveFailure(error, cardId)
        } finally {
          clearPending(handle, cardId)
        }
      },

      /** O "Mover para…": sem arrastar, o card vai para o topo da etapa, onde será visto. */
      moveTo: async (cardId: string, stageId: string) => {
        const board = handle.getBoard()
        const before = board ? findCard(board, cardId) : null
        if (before?.stage.id === stageId) return true

        const flip = captureCardPosition(cardId)
        markPending(handle, cardId)
        handle.mutateBoard((current) => placeCard(current, cardId, stageId, 0))
        void mutateDetail(cardId, (detail) => ({ ...detail, stageId }))
        flip()

        try {
          const card = await apiPost<CardDetail>(`${detailKey(cardId)}/move`, {
            stageId,
            position: 1,
          })
          applyServerCard(card)
          void latest.current.mutate(`${detailKey(cardId)}/stage-checks`)
          return true
        } catch (error) {
          if (before) {
            handle.mutateBoard((current) =>
              placeCard(current, cardId, before.stage.id, before.index)
            )
            void mutateDetail(cardId, (detail) => ({ ...detail, stageId: before.stage.id }))
          }
          reportMoveFailure(error, cardId)
          return false
        } finally {
          clearPending(handle, cardId)
        }
      },

      closeDeal: async (cardId: string, outcome: "won" | "lost", lostReason?: string) => {
        try {
          const card =
            outcome === "won"
              ? await apiPost<CardDetail>(`${detailKey(cardId)}/mark-won`, {})
              : await apiPost<CardDetail>(`${detailKey(cardId)}/mark-lost`, {
                  lostReason: lostReason || null,
                })
          applyServerCard(card)
          toast.success(
            translate(outcome === "won" ? "pipelines.deal.wonDone" : "pipelines.deal.lostDone")
          )
          return true
        } catch (error) {
          const pending = pendingFrom(error)
          if (pending?.code === "requiredFieldsIncomplete" && pending.fieldKeys.length > 0) {
            useBoardUi.getState().setDealGuard({
              cardId,
              outcome,
              lostReason,
              fieldKeys: pending.fieldKeys,
            })
            return false
          }
          toast.error(pipelineErrorText(latest.current.t, error, "pipelines.errors.saveFailed"))
          return false
        }
      },

      reopen: async (cardId: string) => {
        try {
          const card = await apiPost<CardDetail>(`${detailKey(cardId)}/reopen`, {})
          applyServerCard(card)
          handle.revalidate()
          toast.success(translate("pipelines.deal.reopened"))
        } catch (error) {
          toast.error(pipelineErrorText(latest.current.t, error, "pipelines.errors.saveFailed"))
        }
      },

      archive: async (cardId: string) => {
        markPending(handle, cardId)
        const snapshot = handle.getBoard()
        const before = snapshot ? findCard(snapshot, cardId) : null
        handle.mutateBoard((board) => removeCard(board, cardId))

        try {
          const card = await apiPost<CardDetail>(`${detailKey(cardId)}/archive`, {})
          void mutateDetail(cardId, (detail) => ({ ...detail, ...card }))
          void reloadList()
          toast.success(translate("pipelines.card.archived"), {
            action: {
              label: translate("pipelines.card.undo"),
              onClick: () => void actions.unarchive(cardId),
            },
          })
        } catch (error) {
          if (before) {
            handle.mutateBoard((board) => upsertCard(board, before.card))
          }
          toast.error(pipelineErrorText(latest.current.t, error, "pipelines.errors.saveFailed"))
        } finally {
          clearPending(handle, cardId)
        }
      },

      unarchive: async (cardId: string) => {
        try {
          const card = await apiPost<CardDetail>(`${detailKey(cardId)}/archive`, { undo: true })
          applyServerCard(card)
          toast.success(translate("pipelines.card.unarchived"))
        } catch (error) {
          toast.error(pipelineErrorText(latest.current.t, error, "pipelines.errors.saveFailed"))
        }
      },

      remove: async (card: Pick<Card, "id" | "title">) => {
        const confirmed = await latest.current.confirm({
          title: translate("pipelines.card.deleteTitle"),
          description: translate("pipelines.card.deleteHint", { title: card.title }),
          confirmLabel: translate("pipelines.card.delete"),
          destructive: true,
          onConfirm: async () => {
            markPending(handle, card.id)
            try {
              await apiDelete(detailKey(card.id))
            } finally {
              clearPending(handle, card.id)
            }
          },
        })
        if (!confirmed) return false

        handle.mutateBoard((board) => removeCard(board, card.id))
        latest.current.navigation.close()
        void reloadList()
        toast.success(translate("pipelines.card.deleted"))
        return true
      },

      bulkUpdate: async (cardIds: string[], input: BulkUpdateInput, optimistic?: Partial<Card>) => {
        if (input.archived) {
          handle.mutateBoard((board) => cardIds.reduce(removeCard, board))
        } else if (optimistic) {
          handle.mutateBoard((board) =>
            cardIds.reduce((current, id) => patchCard(current, id, optimistic), board)
          )
        }

        try {
          await apiPost(`${cardsPath(boardId)}/bulk-update`, { cardIds, ...input })
          void reloadList()
          return true
        } catch (error) {
          handle.revalidate()
          toast.error(pipelineErrorText(latest.current.t, error, "pipelines.errors.saveFailed"))
          return false
        }
      },

      /** Mover em lote não existe na API: um por um, para as travas de cada card valerem. */
      bulkMove: async (cardIds: string[], stageId: string) => {
        let moved = 0
        const blocked: string[] = []

        for (const cardId of cardIds) {
          const board = handle.getBoard()
          const before = board ? findCard(board, cardId) : null
          if (before?.stage.id === stageId) {
            moved += 1
            continue
          }
          try {
            const card = await apiPost<CardDetail>(`${detailKey(cardId)}/move`, { stageId })
            applyServerCard(card)
            moved += 1
          } catch (error) {
            const pending = pendingFrom(error)
            if (pending) useBoardUi.getState().markBlocked(cardId, pending.items)
            blocked.push(before?.card.title ?? cardId)
          }
        }

        void reloadList()
        return { moved, blocked }
      },
    }

    return actions
  }, [handle])
}

const CardActionsContext = createContext<CardActions | null>(null)

export const CardActionsProvider = CardActionsContext.Provider

/** Para a página montar o valor do contexto. */
export const useCreateCardActions = useCardActionsValue

export function useCardActions(): CardActions {
  const actions = useContext(CardActionsContext)
  if (!actions) throw new Error("useCardActions precisa estar dentro de um pipeline aberto")
  return actions
}
