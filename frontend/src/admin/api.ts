import { useEffect, useState } from "react"
import useSWR, { type SWRConfiguration } from "swr"

import { apiBlob, apiFetch, apiGet, apiPatch, apiPost } from "@/lib/api"
import type {
  Archetype,
  HookType,
  Niche,
  Objective,
  PostRequirement,
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
  replicability: {
    score: Replicability | null
    requirements: string
    /** O mesmo que `requirements`, em códigos: o que a busca cruza com o que a marca tem. */
    requires: PostRequirement[]
  }
  metrics: {
    likes: number | null
    comments: number | null
    baselineMedian: number | null
    relativeEngagement: number | null
    collectedAt: string | null
  }
}

export type ReferenceSource = { url?: string; channel?: string; bannedTerms?: string[]; igMediaId?: string }

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
  /** Veio de um vídeo: a análise viu só a capa e a legenda. */
  partialAnalysis: boolean
  /** Veio da importação do Instagram (a mídia se busca de novo para analisar). */
  instagram: boolean
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

/* ---------- importação do Instagram ---------- */

export type InstagramTokenState = "ok" | "expiring" | "invalid" | "unknown" | "notConfigured"

export type InstagramStatus = {
  state: InstagramTokenState
  expiresAt?: number
  dataAccessExpiresAt?: number
  missingScopes?: string[]
}

export type ImportAccountStatus = "pending" | "running" | "done" | "error"

export type ReferenceCandidate = {
  id: string
  igMediaId: string
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"
  productType: string | null
  format: ReferenceFormat
  permalink: string | null
  previewUrl: string | null
  likeCount: number | null
  commentsCount: number | null
  relativeEngagement: number | null
  highlight: boolean
  postedAt: number | null
  childrenCount: number
  partial: boolean
  status: "pending" | "carded"
  referenceCardId: string | null
}

export type ReferenceImportAccount = {
  id: string
  username: string
  status: ImportAccountStatus
  errorCode: string | null
  retryable: boolean
  retryAt: number | null
  name: string | null
  followersCount: number | null
  fetchedCount: number | null
  eligibleCount: number | null
  baselineMedian: number | null
  fetchedAt: number | null
  candidates: ReferenceCandidate[]
}

export type ReferenceImportSummary = {
  id: string
  niche: Niche | null
  size: ReferenceSize | null
  handles: string[]
  running: boolean
  counts: { accounts: number; errors: number; candidates: number; highlighted: number; carded: number }
  createdAt: number
}

export type ReferenceImport = ReferenceImportSummary & { accounts: ReferenceImportAccount[] }

const IMPORTS = "/admin/reference-imports"

export function useInstagramStatus() {
  return useSWR<InstagramStatus>("/admin/instagram/status", (key: string) => apiGet<InstagramStatus>(key))
}

export function useReferenceImports() {
  return useSWR<{ referenceImports: ReferenceImportSummary[]; instagram: InstagramStatus }>(IMPORTS, (key: string) =>
    apiGet<{ referenceImports: ReferenceImportSummary[]; instagram: InstagramStatus }>(key)
  )
}

export function useReferenceImport(id: string | undefined) {
  return useSWR<ReferenceImport>(id ? `${IMPORTS}/${id}` : null, (key: string) => apiGet<ReferenceImport>(key), {
    // Enquanto alguma conta está na fila, o lote se atualiza sozinho.
    refreshInterval: (data) => (data?.running ? 3000 : 0),
  })
}

export const createReferenceImport = (input: { handles: string; niche: Niche | ""; size: ReferenceSize | "" }) =>
  apiPost<ReferenceImport>(IMPORTS, input)
export const analyzeCandidates = (importId: string, candidateIds: string[]) =>
  apiPost<{ created: string[]; referenceImport: ReferenceImport }>(`${IMPORTS}/${importId}/analyze`, { candidateIds })
export const retryImportAccount = (importId: string, accountId: string) =>
  apiPost<ReferenceImport>(`${IMPORTS}/${importId}/accounts/${accountId}/retry`)

/**
 * Estimativa de custo da análise (US$): uma base por post e um tanto por
 * imagem — carrossel vai com até 10 lâminas. É ordem de grandeza para decidir,
 * não fatura: o custo real fica no card depois da análise.
 */
export function estimateAnalysisCost(candidates: ReferenceCandidate[]): number {
  return candidates.reduce((sum, candidate) => {
    const images = candidate.mediaType === "CAROUSEL_ALBUM" ? Math.min(Math.max(candidate.childrenCount, 1), 10) : 1
    return sum + 0.05 + 0.01 * images
  }, 0)
}

/* ---------- teste lado a lado (Fase 3) ---------- */

// Espelho de `Admin::ReferenceEvalsController` e `ReferenceEvalPairSerializer`.
// O par nunca diz que lado tem referência nem se é controle: a avaliação é às
// cegas, e o braço só aparece na conta do resultado.

export type EvalSide = "left" | "right"
export type EvalVerdict = EvalSide | "tie"
export const EVAL_REASONS = ["hook", "structure", "copy", "visual"] as const
export type EvalReason = (typeof EVAL_REASONS)[number]
export const EVAL_MAX_USABLE = 3

export type EvalRoundSummary = { round: string; total: number; decided: number; createdAt: number }

export type EvalRound = {
  round: string
  total: number
  decided: number
  pairs: { id: string; position: number; requestText: string; brandName: string | null; decided: boolean }[]
}

export type EvalPiece = {
  id: string
  title: string | null
  format: string
  images: { index: number; url: string }[]
  /** As lâminas ainda estão sendo desenhadas. */
  rendering: boolean
  caption: string | null
  hashtags: string[]
  why: string | null
}

export type EvalPair = {
  id: string
  round: string
  position: number
  total: number
  requestText: string
  brand: {
    name: string | null
    segment: string | null
    niche: Niche | null
    archetypes: { primary: Archetype | ""; secondary: Archetype | "" }
  }
  left: EvalPiece[]
  right: EvalPiece[]
  verdict: EvalVerdict | null
  usableLeft: number | null
  usableRight: number | null
  reasons: EvalReason[]
  copiedSides: EvalSide[]
  notes: string | null
  decidedAt: number | null
  previousId: string | null
  nextId: string | null
  nextPendingId: string | null
}

export type EvalInput = {
  verdict: EvalVerdict
  usableLeft: number
  usableRight: number
  reasons: EvalReason[]
  copiedSides: EvalSide[]
  notes: string
}

type EvalTally = {
  pairs: number
  referencesWins: number
  plainWins: number
  ties: number
  winRate: number | null
  usable: { references: number | null; plain: number | null }
}

export type EvalDecision = "turnOn" | "adjust" | "keepOff" | "noSignal"

export type EvalResults = {
  round: string
  pairs: number
  main: EvalTally
  inBank: EvalTally
  outOfBank: EvalTally
  controls: { pairs: number; ties: number; preferred: number }
  copied: { references: number; plain: number }
  followed: { pieces: number; withReference: number }
  costMicroUsd: { references?: number; plain?: number }
  decision: EvalDecision
}

const EVALS = "/admin/reference-evals"

export function useEvalRounds() {
  return useSWR<{ rounds: EvalRoundSummary[] }>(EVALS, (key: string) => apiGet<{ rounds: EvalRoundSummary[] }>(key))
}

export function useEvalRound(round: string | undefined) {
  return useSWR<EvalRound>(round ? `${EVALS}/${round}` : null, (key: string) => apiGet<EvalRound>(key))
}

export function useEvalPair(id: string | undefined) {
  return useSWR<EvalPair>(id ? `${EVALS}/pairs/${id}` : null, (key: string) => apiGet<EvalPair>(key), {
    // As imagens chegam pelo Sidekiq depois da rodada: enquanto alguma peça
    // ainda desenha, o par se atualiza sozinho.
    refreshInterval: (data) => (data && [...data.left, ...data.right].some((piece) => piece.rendering) ? 4000 : 0),
  })
}

export function useEvalResults(round: string | undefined, ready: boolean) {
  return useSWR<EvalResults>(round && ready ? `${EVALS}/${round}/results` : null, (key: string) => apiGet<EvalResults>(key))
}

export const saveEvalPair = (id: string, input: EvalInput) => apiPatch<EvalPair>(`${EVALS}/pairs/${id}`, { pair: input })
