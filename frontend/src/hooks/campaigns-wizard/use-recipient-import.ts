import { useCallback, useRef, useState } from "react"
import { mutate } from "swr"

import { useDraft } from "@/hooks/campaigns-wizard/use-draft"
import { recipientSummaryKey } from "@/hooks/campaigns-wizard/use-campaign-options"
import { apiPost } from "@/lib/api"
import type { ImportContact } from "@/lib/campaigns-wizard/import-protocol"
import type { ImportResult } from "@/lib/campaigns-wizard/types"

// Mandar gente para a campanha aos poucos: em lotes, com progresso, parar e continuar de onde parou.
// Repetir um lote não duplica: o servidor conta como `skippedCount` quem já está lá.

const BATCH_SIZE = 1000

export type RecipientImportState = {
  phase: "idle" | "sending" | "done" | "failed" | "stopped"
  sent: number
  total: number
  imported: number
  skipped: number
  invalid: number
  totalRecipients: number
  error: unknown
}

const IDLE: RecipientImportState = {
  phase: "idle",
  sent: 0,
  total: 0,
  imported: 0,
  skipped: 0,
  invalid: 0,
  totalRecipients: 0,
  error: null,
}

type NextBatch = (offset: number, size: number) => Promise<ImportContact[]>

export function useRecipientImport() {
  const { ensureDraft } = useDraft()
  const [state, setState] = useState(IDLE)
  const stopRef = useRef(false)
  const jobRef = useRef<{ total: number; nextBatch: NextBatch } | null>(null)

  const run = useCallback(
    async (from: RecipientImportState) => {
      const job = jobRef.current
      if (!job) return from

      stopRef.current = false
      let current: RecipientImportState = { ...from, phase: "sending", error: null }
      setState(current)

      try {
        const campaignId = await ensureDraft()

        while (current.sent < job.total) {
          if (stopRef.current) {
            current = { ...current, phase: "stopped" }
            setState(current)
            return current
          }

          const contacts = await job.nextBatch(current.sent, BATCH_SIZE)
          if (contacts.length === 0) break

          const result = await apiPost<ImportResult>(`/campaigns/${campaignId}/import-csv-contacts`, {
            contacts,
          })
          current = {
            ...current,
            sent: current.sent + contacts.length,
            imported: current.imported + result.importedCount,
            skipped: current.skipped + result.skippedCount,
            invalid: current.invalid + result.invalidCount,
            totalRecipients: result.totalRecipients,
          }
          setState(current)
        }

        current = { ...current, phase: "done" }
        setState(current)
        void mutate(recipientSummaryKey(campaignId))
        return current
      } catch (error) {
        current = { ...current, phase: "failed", error }
        setState(current)
        return current
      }
    },
    [ensureDraft]
  )

  const start = useCallback(
    (total: number, nextBatch: NextBatch) => {
      jobRef.current = { total, nextBatch }
      return run({ ...IDLE, total })
    },
    [run]
  )

  /** De onde parou. */
  const resume = useCallback(() => run(state), [run, state])

  const stop = useCallback(() => {
    stopRef.current = true
  }, [])

  const reset = useCallback(() => {
    jobRef.current = null
    setState(IDLE)
  }, [])

  return { state, start, resume, stop, reset }
}
