import { useCallback, useEffect, useRef } from "react"
import { useSWRConfig } from "swr"

import { useChannel } from "@/hooks/use-channel"
import { applyBoardEvent, findCard } from "@/lib/pipelines/board-state"
import { captureCardPosition } from "@/lib/pipelines/flip"
import { cardPath, cardsPath } from "@/lib/pipelines/paths"
import type { BoardEvent, Card, CardDetail } from "@/lib/pipelines/types"
import type { BoardHandle } from "./board-handle"
import { useBoardUi } from "./use-board-ui"

const CHANNEL = "PipelineBoardChannel"
/** Com filtro no servidor, só ele sabe se o card do evento entra: uma leitura por rajada. */
const FILTERED_REFETCH_MS = 750
/** Outra pessoa moveu: a ordem que a tela adivinhou é reconferida, sem pressa. */
const RECONCILE_MS = 1_500

/** Os parâmetros do canal. `epoch` entra quando precisa de uma assinatura nova. */
export function useBoardChannelParams(boardId: string) {
  const epoch = useBoardUi((state) => state.channelEpoch)
  return epoch > 0 ? { boardId, epoch } : { boardId }
}

/** O quadro ouvindo o canal: aplica o que chega, e reler só quando não dá para aplicar. */
export function useBoardRealtime(handle: BoardHandle | null) {
  const { mutate } = useSWRConfig()
  const boardId = handle?.boardId ?? ""
  const params = useBoardChannelParams(boardId)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const schedule = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        handle?.revalidate()
      }, delay)
    },
    [handle]
  )
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const reloadList = useCallback(() => {
    if (!boardId) return
    void mutate((key) => typeof key === "string" && key.startsWith(`${cardsPath(boardId)}?`))
  }, [boardId, mutate])

  const mergeDetail = useCallback(
    (card: Card) => {
      void mutate<CardDetail>(
        cardPath(boardId, card.id),
        (current) => (current ? { ...current, ...card } : current),
        { revalidate: false }
      )
    },
    [boardId, mutate]
  )

  const onMessage = useCallback(
    (message: BoardEvent) => {
      if (!handle) return

      switch (message.event) {
        case "card_visibility_changed":
          useBoardUi.getState().bumpChannel()
          handle.revalidate()
          return

        case "custom_fields_changed":
          handle.revalidate()
          return

        case "card_created":
        case "card_updated":
        case "card_moved":
        case "card_deleted":
        case "cards_reordered":
          break

        case "comment_created":
        case "comment_deleted":
          // O detalhe do card aberto é outra leitura: a contagem da aba anda junto com a do quadro.
          void mutate<CardDetail>(
            cardPath(boardId, message.data.cardId),
            (current) =>
              current
                ? {
                    ...current,
                    commentsCount: Math.max(
                      0,
                      current.commentsCount + (message.event === "comment_created" ? 1 : -1)
                    ),
                  }
                : current,
            { revalidate: false }
          )
          handle.mutateBoard((board) => applyBoardEvent(board, message))
          return

        default:
          // Etapas valem para a tela como ela está, com ou sem filtro.
          handle.mutateBoard((board) => applyBoardEvent(board, message))
          return
      }

      reloadList()

      if (message.event !== "card_deleted" && message.event !== "cards_reordered") {
        mergeDetail(message.data)
      }

      // O eco da própria escrita: quem escreveu já cuida do cache, e o evento antigo desfaria o
      // otimista de um arraste seguinte.
      const cardId = "id" in message.data ? message.data.id : null
      if (cardId && handle.pending.has(cardId)) return

      if (handle.isServerFiltered()) {
        schedule(FILTERED_REFETCH_MS)
        return
      }

      const board = handle.getBoard()
      const known = board && cardId ? findCard(board, cardId) : null

      if (message.event === "card_created" && !known) {
        useBoardUi.getState().markFresh(message.data.id)
      }

      const movedStage =
        message.event !== "card_deleted" &&
        message.event !== "cards_reordered" &&
        known &&
        known.stage.id !== message.data.stageId

      const flip = movedStage && !message.data.archived ? captureCardPosition(known.card.id) : null

      handle.mutateBoard((current) => applyBoardEvent(current, message))
      flip?.()

      // O índice de um card que entra numa etapa é uma aproximação: `position` conta o que esta
      // tela não mostra. A leitura seguinte acerta, sem redesenhar o que não mudou.
      const repositioned =
        message.event === "card_updated" && known && known.card.position !== message.data.position
      if (movedStage || repositioned) schedule(RECONCILE_MS)
    },
    [boardId, handle, mergeDetail, mutate, reloadList, schedule]
  )

  const { connected } = useChannel<BoardEvent>(handle ? CHANNEL : null, params, onMessage)

  // Voltou depois de cair: o que passou enquanto estava fora só vem relendo. A primeira conexão
  // não relê, porque o quadro acabou de chegar.
  const everConnected = useRef(false)
  const dropped = useRef(false)
  useEffect(() => {
    if (!connected) {
      if (everConnected.current) dropped.current = true
      return
    }
    everConnected.current = true
    if (dropped.current) {
      dropped.current = false
      handle?.revalidate()
      reloadList()
    }
  }, [connected, handle, reloadList])

  return { connected }
}
