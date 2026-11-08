import { useCallback, useEffect, useMemo } from "react"
import { useSearchParams } from "@/lib/router"

import type { BoardFilters, DateField, Funnel } from "@/components/funnels/types"
import { useLocalStorage } from "@/hooks/use-local-storage"

// O que está aberto mora na URL, para o link do Dashboard abrir o funil certo e a tela ser
// compartilhável. O hábito de cada pessoa (funil, período, campo de data, "Sem etapa") fica guardado,
// como no `pipeline-filters` da origem, e vale quando a URL não diz nada.

export const DAY_OPTIONS = [7, 15, 30, 60, 90, 180, 365] as const
const DATE_FIELDS: DateField[] = ["last_message_at", "created_at"]

const STORAGE_KEY = "vekoo.funnels.v1"

type SavedFilters = {
  funnelId: string | null
  dateField: DateField
  days: number
  showNoStage: boolean
}

const DEFAULTS: SavedFilters = {
  funnelId: null,
  dateField: "last_message_at",
  days: 30,
  showNoStage: true,
}

export function useFunnelFilters(funnels: Funnel[] | undefined) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [saved, setSaved] = useLocalStorage<SavedFilters>(STORAGE_KEY, DEFAULTS)

  const funnelParam = searchParams.get("funnel")
  const funnelId = useMemo(() => {
    if (!funnels?.length) return null
    const known = (id: string | null | undefined) => Boolean(id && funnels.some((funnel) => funnel.id === id))
    if (known(funnelParam)) return funnelParam
    if (known(saved.funnelId)) return saved.funnelId
    return funnels[0].id
  }, [funnelParam, funnels, saved.funnelId])

  // Veio pelo link do Dashboard: da próxima vez, o menu abre este também.
  useEffect(() => {
    if (funnelId && funnelId !== saved.funnelId) {
      setSaved((current) => ({ ...current, funnelId }))
    }
  }, [funnelId, saved.funnelId, setSaved])

  const daysParam = Number(searchParams.get("days"))
  const dateFieldParam = searchParams.get("dateField") as DateField | null
  const days = DAY_OPTIONS.includes(daysParam as (typeof DAY_OPTIONS)[number]) ? daysParam : saved.days
  const dateField = dateFieldParam && DATE_FIELDS.includes(dateFieldParam) ? dateFieldParam : saved.dateField
  const assignedUser = searchParams.get("assignedUser")
  const tagsParam = searchParams.get("tags")
  const q = searchParams.get("q") ?? ""

  const filters = useMemo<BoardFilters>(
    () => ({
      dateField,
      days,
      assignedUser,
      tagIds: tagsParam ? tagsParam.split(",").filter(Boolean) : [],
      q,
    }),
    [assignedUser, dateField, days, q, tagsParam]
  )

  const setParams = useCallback(
    (entries: Record<string, string | null>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [name, value] of Object.entries(entries)) {
            if (value) next.set(name, value)
            else next.delete(name)
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const setFunnelId = useCallback(
    (id: string | null) => {
      setSaved((current) => ({ ...current, funnelId: id }))
      setParams({ funnel: id })
    },
    [setParams, setSaved]
  )

  const setDays = useCallback(
    (value: number) => {
      setSaved((current) => ({ ...current, days: value }))
      setParams({ days: String(value) })
    },
    [setParams, setSaved]
  )

  const setDateField = useCallback(
    (value: DateField) => {
      setSaved((current) => ({ ...current, dateField: value }))
      setParams({ dateField: value })
    },
    [setParams, setSaved]
  )

  const setAssignedUser = useCallback(
    (value: string | null) => setParams({ assignedUser: value }),
    [setParams]
  )
  const setTagIds = useCallback(
    (value: string[]) => setParams({ tags: value.length ? value.join(",") : null }),
    [setParams]
  )
  const setQuery = useCallback((value: string) => setParams({ q: value || null }), [setParams])

  const clearFilters = useCallback(
    () => setParams({ assignedUser: null, tags: null, q: null }),
    [setParams]
  )

  const toggleNoStage = useCallback(
    () => setSaved((current) => ({ ...current, showNoStage: !current.showNoStage })),
    [setSaved]
  )

  /* ---------- o painel da conversa ---------- */

  const openChatId = searchParams.get("chat")

  // Com histórico, de propósito: o voltar do celular fecha o painel, e não sai da tela.
  const openChat = useCallback(
    (id: string) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.set("chat", id)
        return next
      })
    },
    [setSearchParams]
  )

  const closeChat = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete("chat")
        return next
      },
      { replace: true }
    )
  }, [setSearchParams])

  return {
    funnelId,
    filters,
    showNoStage: saved.showNoStage,
    activeFilterCount: (assignedUser ? 1 : 0) + (tagsParam ? 1 : 0),
    setFunnelId,
    setDays,
    setDateField,
    setAssignedUser,
    setTagIds,
    setQuery,
    clearFilters,
    toggleNoStage,
    openChatId,
    openChat,
    closeChat,
  }
}
