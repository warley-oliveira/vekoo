import { useEffect, useState } from "react"
import useSWR, { type SWRConfiguration } from "swr"

import { apiBlob, apiFetch, apiGet, apiPatch, apiPost } from "@/lib/api"
import type {
  Archetype,
  HookType,
  Niche,
  Objective,
  ReferenceFormat,
  ReferenceOrigin,
  ReferenceSize,
  ReferenceStatus,
  Replicability,
  TargetMetric,
} from "@/lib/taxonomy"

// O cliente da curadoria (`/admin/reference-cards`). Espelho de
// `Admin::ReferenceCardSerializer` e de `ReferenceCard::Analysis` (a forma da
// análise) — quem confere de verdade é o servidor; aqui são os tipos.

export type AnalysisStatus = "pending" | "running" | "done" | "failed"

export type ReferenceAnalysis = {
  hook: { type: HookType | null; description: string }
  structure: { summary: string; beats: string[] }
  visual: { composition: string; color: string; typography: string; imagery: string }
  copy: { function: string; tone: string; cta: string }
  whyItWorks: {
    /** Por que este post funciona. */
    mechanism: string
    /** Uma frase sem nicho, que vale para qualquer ramo (entra no embedding). */
    transferablePrinciple: string
    /** Uma ou duas, a mais forte primeiro. */
    targetMetrics: TargetMetric[]
    /** Uma frase: onde o padrão não serve (vai na ficha do agente). */
    whenNotToUse: string
  }
  replicability: { score: Replicability | null; requirements: string }
  metrics: {
    likes: number | null
    comments: number | null
    baselineMedian: number | null
    relativeEngagement: number | null
    collectedAt: string | null
  }
}

export type ReferenceSource = { url?: string; channel?: string; bannedTerms?: string[] }

/** `leak`: cita a origem · `copied`: repete frase do post · `noEmbedding`: sem vetor (não barra). */
export type ReferenceFinding =
  | { code: "leak"; path: string; kind: "url" | "handle" | "term"; match: string }
  | { code: "copied"; path: string }
  | { code: "noEmbedding" }

export type ReferenceSummary = {
  id: string
  status: ReferenceStatus
  origin: ReferenceOrigin
  niche: Niche | null
  size: ReferenceSize | null
  archetypes: Archetype[]
  objective: Objective | null
  format: ReferenceFormat | null
  hookType: HookType | null
  replicability: Replicability | null
  relativeEngagement: number | null
  version: number
  analysisStatus: AnalysisStatus
  summary: string | null
  channel: string | null
  hasThumbnail: boolean
  embedded: boolean
  createdAt: number
  updatedAt: number
}

export type ReferenceCard = ReferenceSummary & {
  analysis: ReferenceAnalysis
  source: ReferenceSource
  suggestedLayoutId: string | null
  archivedReason: string | null
  analysisError: { code: string } | null
  analysisModel: string | null
  analysisCostMicroUsd: number
  analyzedAt: number | null
  embeddedAt: number | null
  findings: ReferenceFinding[]
  originalsCount: number
  curatedBy: { id: string; name: string } | null
  publishedAt: number | null
}

export type ReferenceListParams = {
  status?: ReferenceStatus[]
  niche?: Niche
  format?: ReferenceFormat
  objective?: Objective
  q?: string
  sort?: "updatedAt" | "createdAt" | "relativeEngagement" | "replicability" | "version"
  dir?: "asc" | "desc"
  page?: number
  per?: number
}

export type ReferenceList = {
  referenceCards: ReferenceSummary[]
  meta: { total: number; page: number; per: number; counts: Partial<Record<ReferenceStatus, number>> }
}

export type ReferenceEdit = Partial<
  Pick<ReferenceCard, "niche" | "size" | "archetypes" | "objective" | "format" | "suggestedLayoutId" | "analysis" | "source">
>

const BASE = "/admin/reference-cards"

export function referenceListPath(params: ReferenceListParams): string {
  const query = new URLSearchParams()
  if (params.status?.length) query.set("status", params.status.join(","))
  for (const key of ["niche", "format", "objective", "q", "sort", "dir"] as const) {
    const value = params[key]
    if (value) query.set(key, value)
  }
  if (params.page) query.set("page", String(params.page))
  if (params.per) query.set("per", String(params.per))
  const text = query.toString()
  return text ? `${BASE}?${text}` : BASE
}

export function useReferenceList(params: ReferenceListParams) {
  return useSWR<ReferenceList>(referenceListPath(params), (key: string) => apiGet<ReferenceList>(key), {
    keepPreviousData: true,
    // Enquanto há análise na fila, a lista se atualiza sozinha.
    refreshInterval: (data) =>
      data?.referenceCards.some((card) => card.analysisStatus === "pending" || card.analysisStatus === "running") ? 4000 : 0,
  })
}

export function useReferenceCard(id: string | undefined, config?: SWRConfiguration<ReferenceCard>) {
  return useSWR<ReferenceCard>(id ? `${BASE}/${id}` : null, (key: string) => apiGet<ReferenceCard>(key), {
    refreshInterval: (data) => (data && (data.analysisStatus === "pending" || data.analysisStatus === "running") ? 3000 : 0),
    ...config,
  })
}

export type ReferenceDraft = {
  images: File[]
  url: string
  channel: string
  niche: Niche | ""
  size: ReferenceSize | ""
  bannedTerms: string[]
  baselineMedian: string
}

export function createReference(draft: ReferenceDraft): Promise<ReferenceCard> {
  const form = new FormData()
  draft.images.forEach((file) => form.append("images[]", file))
  if (draft.url) form.append("url", draft.url)
  if (draft.channel) form.append("channel", draft.channel)
  if (draft.niche) form.append("niche", draft.niche)
  if (draft.size) form.append("size", draft.size)
  if (draft.baselineMedian) form.append("baselineMedian", draft.baselineMedian)
  draft.bannedTerms.forEach((term) => form.append("bannedTerms[]", term))
  return apiFetch<ReferenceCard>(BASE, { method: "POST", body: form })
}

export const updateReference = (id: string, edit: ReferenceEdit) =>
  apiPatch<ReferenceCard>(`${BASE}/${id}`, { referenceCard: edit })
export const publishReference = (id: string) => apiPost<ReferenceCard>(`${BASE}/${id}/publish`)
export const rejectReference = (id: string, reason: string) => apiPost<ReferenceCard>(`${BASE}/${id}/reject`, { reason })
export const reopenReference = (id: string) => apiPost<ReferenceCard>(`${BASE}/${id}/reopen`)
export const retryReference = (id: string) => apiPost<ReferenceCard>(`${BASE}/${id}/retry`)

/**
 * A miniatura vem da API com a sessão (o `Authorization` não vai num
 * `<img src>`): busca o blob e devolve uma URL local, liberada ao desmontar.
 */
export function useThumbnail(id: string, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let current: string | null = null
    let cancelled = false
    apiBlob(`${BASE}/${id}/thumbnail`)
      .then((blob) => {
        if (cancelled) return
        current = URL.createObjectURL(blob)
        setUrl(current)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      if (current) URL.revokeObjectURL(current)
    }
  }, [id, enabled])

  return url
}
