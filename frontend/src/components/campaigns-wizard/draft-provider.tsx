import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { UseFormReturn } from "react-hook-form"

import { applyServerErrors } from "@/components/shared"
import { DraftContext, useSaveState } from "@/hooks/campaigns-wizard/use-draft"
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
  // A pessoa mexeu em alguma coisa, e isso já vale um rascunho. Não basta olhar os valores: a cópia de uma
  // campanha nasce com tudo preenchido, e abrir e sair não pode deixar nada na lista.
  const worthSavingRef = useRef(false)
  // Chegou alteração depois de a última requisição sair: ainda não dá para dizer "salvo".
  const changedSinceRef = useRef(false)

  useEffect(() => {
    useSaveState.setState({ status: "idle", savedAt: null, error: null, leaving: false })
  }, [])

  const save = useCallback(
    async (force: boolean) => {
      if (finishedRef.current) return
      if (!idRef.current && !force && !worthSavingRef.current) {
        useSaveState.setState({ status: "idle" })
        return
      }

      changedSinceRef.current = false
      const payload = toDraftPayload(form.getValues(), fallbackName)
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
        useSaveState.setState({
          status: changedSinceRef.current ? "pending" : "saved",
          savedAt: Date.now(),
          error: null,
        })

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
    [fallbackName, form, onCreated]
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

        // `isDirty`, para contar só o que a pessoa fez: o número que a tela já escolhe sozinha não é uma
        // decisão dela.
        const values = form.getValues()
        worthSavingRef.current = Boolean(isDirty) && hasContent(values, initialValues)
        if (!idRef.current && !worthSavingRef.current) return

        const changes = idRef.current
          ? changedKeys(toDraftPayload(values, fallbackName), savedRef.current)
          : { any: true }
        if (Object.keys(changes).length === 0) return

        changedSinceRef.current = true
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
