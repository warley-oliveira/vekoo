import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { UseFormReturn } from "react-hook-form"
import { mutate as globalMutate } from "swr"
import { create } from "zustand"

import { applyServerErrors } from "@/components/shared"
import { ApiError, apiPatch, apiPost } from "@/lib/api"
import {
  changedKeys,
  hasContent,
  toDraftPayload,
  type DraftPayload,
  type WizardValues,
} from "@/lib/campaigns-wizard/form"
import type { CampaignResponse } from "@/lib/campaigns-wizard/types"

// O rascunho se salva sozinho. Cada mudança no formulário espera a pessoa parar de digitar e vai para
// uma fila de uma requisição por vez, que manda só o que mudou. Criar é a mesma coisa, só que na
// primeira vez que há o que guardar, ou quando a pessoa escolhe o público, que precisa de um id.

const SAVE_DELAY_MS = 800

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "locked"

type SaveState = {
  status: SaveStatus
  savedAt: number | null
  error: unknown
}

/** Fora do formulário, para só o indicador redesenhar: digitar não passa pela tela inteira. */
export const useSaveState = create<SaveState>()(() => ({
  status: "idle",
  savedAt: null,
  error: null,
}))

export type Draft = {
  /** `null` até existir o que guardar. */
  campaignId: string | null
  /** Agora, sem esperar a pausa na digitação. Rejeita se não salvou. */
  flush: () => Promise<void>
  /** O id do rascunho, criando se ainda não houver. */
  ensureDraft: () => Promise<string>
  /** Lançou ou descartou: daqui para frente nada mais é salvo. */
  finish: () => void
}

const DraftContext = createContext<Draft | null>(null)

export function useDraft(): Draft {
  const draft = useContext(DraftContext)
  if (!draft) throw new Error("useDraft precisa estar dentro de DraftProvider")
  return draft
}

const SERVER_FIELDS = [
  "name",
  "messages",
  "connectorIds",
  "wabaConnectorId",
  "phoneNumberIds",
  "templateIds",
  "attachmentId",
  "sendDays",
  "timezone",
  "dailyLimitPerConnector",
] as const

export function reloadCampaignLists() {
  return globalMutate(
    (key) => typeof key === "string" && key.startsWith("/campaigns") && !key.includes("/recipient"),
    undefined,
    { revalidate: true }
  )
}

export function DraftProvider({
  form,
  campaignId: initialId,
  initialSaved,
  initialValues,
  fallbackName,
  onCreated,
  children,
}: {
  form: UseFormReturn<WizardValues>
  campaignId: string | null
  /** O que já está no servidor, ao retomar. */
  initialSaved: DraftPayload | null
  initialValues: WizardValues
  fallbackName: string
  onCreated: (id: string) => void
  children: ReactNode
}) {
  const [campaignId, setCampaignId] = useState(initialId)

  const idRef = useRef(initialId)
  const savedRef = useRef(initialSaved)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const timerRef = useRef<number | undefined>(undefined)
  const finishedRef = useRef(false)

  useEffect(() => {
    useSaveState.setState({ status: "idle", savedAt: null, error: null })
  }, [])

  const save = useCallback(
    async (force: boolean) => {
      if (finishedRef.current) return

      const values = form.getValues()
      const payload = toDraftPayload(values, fallbackName)

      if (!idRef.current && !force && !hasContent(values, initialValues)) {
        useSaveState.setState({ status: "idle" })
        return
      }

      const changes = idRef.current ? changedKeys(payload, savedRef.current) : payload
      if (Object.keys(changes).length === 0) {
        useSaveState.setState((state) => ({ status: state.savedAt ? "saved" : "idle", error: null }))
        return
      }

      useSaveState.setState({ status: "saving", error: null })
      try {
        const created = idRef.current
          ? null
          : (await apiPost<CampaignResponse>("/campaigns", payload)).campaign
        if (!created) await apiPatch<CampaignResponse>(`/campaigns/${idRef.current}`, changes)

        savedRef.current = { ...savedRef.current, ...payload }
        useSaveState.setState({ status: "saved", savedAt: Date.now(), error: null })

        if (created) {
          idRef.current = created.id
          setCampaignId(created.id)
          onCreated(created.id)
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === "campaignNotEditable") {
          // Lançada em outra aba, ou agendada. Tentar de novo não adianta.
          useSaveState.setState({ status: "locked", error })
        } else {
          applyServerErrors(error, form.setError, { fields: SERVER_FIELDS })
          useSaveState.setState({ status: "error", error })
        }
        throw error
      }
    },
    [fallbackName, form, initialValues, onCreated]
  )

  const enqueue = useCallback(
    (force: boolean) => {
      window.clearTimeout(timerRef.current)
      const run = queueRef.current.catch(() => {}).then(() => save(force))
      queueRef.current = run
      return run
    },
    [save]
  )

  const flush = useCallback(() => enqueue(false), [enqueue])

  const ensureDraft = useCallback(async () => {
    await enqueue(true)
    if (!idRef.current) throw new Error("campaign draft not created")
    return idRef.current
  }, [enqueue])

  const finish = useCallback(() => {
    finishedRef.current = true
    window.clearTimeout(timerRef.current)
    useSaveState.setState({ status: "idle", error: null })
  }, [])

  useEffect(() => {
    const unsubscribe = form.subscribe({
      formState: { values: true, isDirty: true },
      callback: ({ isDirty }) => {
        if (finishedRef.current) return

        // `isDirty`, para contar só o que a pessoa fez: o número que a tela já escolhe sozinha, ou abrir
        // uma cópia e sair, não pode deixar um rascunho na lista.
        const values = form.getValues()
        if (!idRef.current && !(isDirty && hasContent(values, initialValues))) return

        const changes = idRef.current
          ? changedKeys(toDraftPayload(values, fallbackName), savedRef.current)
          : { any: true }
        if (Object.keys(changes).length === 0) return

        useSaveState.setState({ status: "pending" })
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          void enqueue(false).catch(() => {
            // O indicador mostra o erro e oferece tentar de novo.
          })
        }, SAVE_DELAY_MS)
      },
    })

    return () => {
      unsubscribe()
      window.clearTimeout(timerRef.current)
    }
  }, [enqueue, fallbackName, form, initialValues])

  const draft = useMemo(
    () => ({ campaignId, flush, ensureDraft, finish }),
    [campaignId, ensureDraft, finish, flush]
  )

  return <DraftContext.Provider value={draft}>{children}</DraftContext.Provider>
}
