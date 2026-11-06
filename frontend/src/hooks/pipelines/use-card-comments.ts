import { useCallback, useMemo } from "react"
import useSWRInfinite from "swr/infinite"

import { useChannel } from "@/hooks/use-channel"
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api"
import { cardPath } from "@/lib/pipelines/paths"
import type { BoardEvent, CardComment, CommentsPage } from "@/lib/pipelines/types"
import { useBoardChannelParams } from "./use-board-realtime"

const NO_COMMENTS: CardComment[] = []

/** O comentário que chega sem `replies` (evento) não pode apagar as respostas que já estão na tela. */
function mergeComment(existing: CardComment, incoming: CardComment): CardComment {
  return {
    ...existing,
    ...incoming,
    replies: incoming.replies?.length ? incoming.replies : existing.replies,
  }
}

function mapList(list: CardComment[], incoming: CardComment): CardComment[] {
  let changed = false
  const next = list.map((comment) => {
    if (comment.id === incoming.id) {
      changed = true
      return mergeComment(comment, incoming)
    }
    if (comment.replies?.some((reply) => reply.id === incoming.id)) {
      changed = true
      return {
        ...comment,
        replies: comment.replies.map((reply) =>
          reply.id === incoming.id ? mergeComment(reply, incoming) : reply
        ),
      }
    }
    return comment
  })
  return changed ? next : list
}

function hasComment(pages: CommentsPage[], id: string): boolean {
  const search = (list: CardComment[]) =>
    list.some(
      (comment) => comment.id === id || comment.replies?.some((reply) => reply.id === id)
    )
  return pages.some((page) => search(page.comments) || search(page.pinned))
}

/** Comentário novo. A página 0 é a mais recente, e dentro dela a ordem é cronológica. */
export function addToPages(pages: CommentsPage[], comment: CardComment): CommentsPage[] {
  if (pages.length === 0 || hasComment(pages, comment.id)) return pages

  if (comment.parentId) {
    const attach = (list: CardComment[]) =>
      list.map((parent) =>
        parent.id === comment.parentId
          ? {
              ...parent,
              replyCount: parent.replyCount + 1,
              replies: [...(parent.replies ?? []), comment],
            }
          : parent
      )
    return pages.map((page) => ({
      ...page,
      totalCount: page.totalCount + 1,
      comments: attach(page.comments),
      pinned: attach(page.pinned),
    }))
  }

  return pages.map((page, index) => ({
    ...page,
    totalCount: page.totalCount + 1,
    comments: index === 0 ? [...page.comments, comment] : page.comments,
  }))
}

/** Editar, reagir, fixar. Fixar muda o comentário de lista: os fixados vêm à parte. */
export function updateInPages(pages: CommentsPage[], incoming: CardComment): CommentsPage[] {
  if (incoming.parentId === null) {
    const inPinned = pages.some((page) => page.pinned.some((item) => item.id === incoming.id))

    if (incoming.pinned && !inPinned) {
      const existing = pages
        .flatMap((page) => page.comments)
        .find((comment) => comment.id === incoming.id)
      const merged = existing ? mergeComment(existing, incoming) : incoming
      return pages.map((page, index) => ({
        ...page,
        comments: page.comments.filter((comment) => comment.id !== incoming.id),
        pinned: index === 0 ? [...page.pinned, merged] : page.pinned,
      }))
    }

    if (!incoming.pinned && inPinned) {
      const existing = pages
        .flatMap((page) => page.pinned)
        .find((comment) => comment.id === incoming.id)
      const merged = existing ? mergeComment(existing, incoming) : incoming
      return pages.map((page, index) => ({
        ...page,
        pinned: page.pinned.filter((comment) => comment.id !== incoming.id),
        comments:
          index === 0
            ? [...page.comments, merged].sort((a, b) => a.createdAt - b.createdAt)
            : page.comments,
      }))
    }
  }

  return pages.map((page) => ({
    ...page,
    comments: mapList(page.comments, incoming),
    pinned: mapList(page.pinned, incoming),
  }))
}

export function removeFromPages(pages: CommentsPage[], id: string): CommentsPage[] {
  const strip = (list: CardComment[]) =>
    list
      .filter((comment) => comment.id !== id)
      .map((comment) =>
        comment.replies?.some((reply) => reply.id === id)
          ? {
              ...comment,
              replyCount: Math.max(0, comment.replyCount - 1),
              replies: comment.replies.filter((reply) => reply.id !== id),
            }
          : comment
      )

  return pages.map((page) => ({
    ...page,
    totalCount: Math.max(0, page.totalCount - 1),
    comments: strip(page.comments),
    pinned: strip(page.pinned),
  }))
}

export type NewComment = {
  body: string
  parentId?: string | null
  files?: File[]
}

/** Os comentários do card, em páginas que andam para trás, com o canal mantendo em dia. */
export function useCardComments(boardId: string, cardId: string) {
  const base = `${cardPath(boardId, cardId)}/comments`
  const params = useBoardChannelParams(boardId)

  const { data, error, isLoading, isValidating, size, setSize, mutate } =
    useSWRInfinite<CommentsPage>(
      (_index, previous: CommentsPage | null) => {
        if (previous && !previous.hasMore) return null
        return previous?.nextCursor
          ? `${base}?before=${encodeURIComponent(previous.nextCursor)}`
          : base
      },
      (path: string) => apiGet<CommentsPage>(path),
      { revalidateOnFocus: false, revalidateFirstPage: false, revalidateAll: false }
    )

  const patch = useCallback(
    (update: (pages: CommentsPage[]) => CommentsPage[]) =>
      mutate((pages) => (pages ? update(pages) : pages), { revalidate: false }),
    [mutate]
  )

  useChannel<BoardEvent>("PipelineBoardChannel", params, (message) => {
    switch (message.event) {
      case "comment_created":
        if (message.data.cardId === cardId) void patch((pages) => addToPages(pages, message.data.comment))
        break
      case "comment_updated":
        if (message.data.cardId === cardId) void patch((pages) => updateInPages(pages, message.data.comment))
        break
      case "comment_deleted":
        if (message.data.cardId === cardId) void patch((pages) => removeFromPages(pages, message.data.commentId))
        break
    }
  })

  const actions = useMemo(
    () => ({
      add: async ({ body, parentId, files }: NewComment) => {
        let comment: CardComment
        if (files && files.length > 0) {
          const form = new FormData()
          // O corpo é obrigatório na API: só com arquivo, vai o nome dele.
          form.append("comment[body]", body || files.map((file) => file.name).join(", "))
          if (parentId) form.append("comment[parentId]", parentId)
          for (const file of files) form.append("comment[files][]", file)
          comment = await apiUpload<CardComment>(base, form)
        } else {
          comment = await apiPost<CardComment>(base, {
            comment: { body, parentId: parentId ?? null },
          })
        }
        await patch((pages) => addToPages(pages, comment))
        return comment
      },
      edit: async (id: string, body: string) => {
        const comment = await apiPatch<CardComment>(`${base}/${id}`, { comment: { body } })
        await patch((pages) => updateInPages(pages, comment))
      },
      remove: async (id: string) => {
        await apiDelete(`${base}/${id}`)
        await patch((pages) => removeFromPages(pages, id))
      },
      pin: async (id: string, pinned: boolean) => {
        const comment = pinned
          ? await apiPost<CardComment>(`${base}/${id}/pin`, {})
          : await apiDelete<CardComment>(`${base}/${id}/pin`)
        await patch((pages) => updateInPages(pages, comment))
      },
      react: async (id: string, emoji: string, on: boolean) => {
        const comment = on
          ? await apiPost<CardComment>(`${base}/${id}/reactions`, { emoji })
          : await apiDelete<CardComment>(`${base}/${id}/reactions`, {
              body: JSON.stringify({ emoji }),
            })
        await patch((pages) => updateInPages(pages, comment))
      },
    }),
    [base, patch]
  )

  const comments = useMemo(
    () => (data ? [...data].reverse().flatMap((page) => page.comments) : NO_COMMENTS),
    [data]
  )
  const pinned = data?.[0]?.pinned ?? NO_COMMENTS
  const last = data?.[data.length - 1]

  return {
    comments,
    pinned,
    totalCount: data?.[0]?.totalCount ?? 0,
    hasMore: last?.hasMore ?? false,
    error,
    isLoading: isLoading && !data,
    isLoadingMore: isValidating && size > (data?.length ?? 0),
    loadMore: () => setSize(size + 1),
    reload: mutate,
    ...actions,
  }
}
