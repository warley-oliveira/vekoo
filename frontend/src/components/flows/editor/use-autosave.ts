import { useEffect, useRef } from "react"
import { useReactFlow } from "@xyflow/react"

import { useFlowMutations } from "@/hooks/flows/use-flows"
import { triggerTypeOf, isTrigger } from "@/lib/flows/catalog"
import { prepareDefinition } from "@/lib/flows/fields"
import type { FlowDefinition, FlowDetail } from "@/lib/flows/types"
import { definitionFingerprint, validateFlow } from "@/lib/flows/validate"

import { useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"

// O salvamento automático: uma pausa depois da última alteração, e na hora de sair da aba. A versão
// publicada não muda: o que grava aqui é o rascunho. Falhou, tenta de novo com intervalo crescente e deixa
// o aviso na tela, porque o trabalho continua seguro enquanto a aba estiver aberta.
//
// A API não tem trava de versão. Quem descobre edição em outro lugar é a tela: compara a data do rascunho
// a cada revalidação, e pergunta antes de sobrescrever.

const SAVE_DELAY = 1_200
const VALIDATE_DELAY = 350
const RETRY_DELAYS = [3_000, 8_000, 20_000, 45_000]

const EMPTY: FlowDefinition = { nodes: [], edges: [] }

export function useAutosave(flow: FlowDetail) {
  const api = useEditorApi()
  const reactFlow = useReactFlow()
  const { saveDefinition, updateFlow } = useFlowMutations()

  const flowRef = useRef(flow)
  useEffect(() => {
    flowRef.current = flow
  })

  const stamp = useRef(flow.draft?.updatedAt ?? 0)
  const savedRevision = useRef(api.getState().revision)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const retryTimer = useRef<number | undefined>(undefined)
  const attempts = useRef(0)
  const lastTrigger = useRef(flow.triggerType)
  const inConflict = useRef(false)

  useEffect(() => {
    const ui = useEditorUi

    const refreshPublished = () => {
      const published = flowRef.current.publishedVersion?.definition
      if (!published) {
        ui.setState({ unpublished: false })
        return
      }
      const current = definitionFingerprint(api.getState().serialize() as Parameters<typeof definitionFingerprint>[0])
      const live = definitionFingerprint(prepareDefinition(published) as Parameters<typeof definitionFingerprint>[0])
      ui.setState({ unpublished: current !== live })
    }

    const syncTrigger = () => {
      // O gatilho que a lista mostra é do fluxo. Publicar acerta sozinho; num rascunho, é aqui. Num fluxo no ar, não:
      // é esse valor que decide o que dispara, e o rascunho ainda não foi publicado.
      if (flowRef.current.status === "published") return
      const trigger = api.getState().nodes.find((node) => isTrigger(node.type))
      const type = trigger?.type ? triggerTypeOf(trigger.type) : null
      if (!type || type === lastTrigger.current) return
      lastTrigger.current = type
      void updateFlow(flowRef.current.id, { triggerType: type }).catch(() => {
        lastTrigger.current = flowRef.current.triggerType
      })
    }

    const save = (): Promise<boolean> => {
      if (inFlight.current) return inFlight.current
      if (api.getState().readOnly || inConflict.current) return Promise.resolve(!inConflict.current)

      const state = api.getState()
      const revision = state.revision
      if (revision === savedRevision.current) {
        ui.setState({ saveStatus: "saved" })
        return Promise.resolve(true)
      }

      ui.setState({ saveStatus: "saving" })
      window.clearTimeout(retryTimer.current)

      const request = saveDefinition(flowRef.current.id, state.serialize(reactFlow.getViewport()))
        .then(({ version }) => {
          inFlight.current = null
          attempts.current = 0
          savedRevision.current = revision
          stamp.current = version.updatedAt
          syncTrigger()
          refreshPublished()
          if (api.getState().revision !== revision) return save()
          ui.setState({ saveStatus: "saved" })
          return true
        })
        .catch(() => {
          inFlight.current = null
          ui.setState({ saveStatus: "error" })
          const delay = RETRY_DELAYS[Math.min(attempts.current, RETRY_DELAYS.length - 1)]
          attempts.current += 1
          retryTimer.current = window.setTimeout(() => void save(), delay)
          return false
        })

      inFlight.current = request
      return request
    }

    const flush = async () => {
      window.clearTimeout(timer.current)
      return save()
    }

    let validateTimer: number | undefined
    const validate = () => {
      const { nodes, edges } = api.getState()
      ui.setState({ issues: validateFlow(nodes, edges) })
    }

    const unsubscribe = api.subscribe((state, previous) => {
      if (state.revision === previous.revision) return

      window.clearTimeout(validateTimer)
      validateTimer = window.setTimeout(validate, VALIDATE_DELAY)

      if (state.readOnly || inConflict.current) return
      ui.setState({ saveStatus: "dirty" })
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void save(), SAVE_DELAY)
    })

    const onHide = () => {
      if (document.visibilityState === "hidden") void flush()
    }
    document.addEventListener("visibilitychange", onHide)

    ui.setState({
      flush,
      acceptDraft: (draft) => {
        if (draft) stamp.current = draft.updatedAt
      },
    })
    validate()
    refreshPublished()

    return () => {
      unsubscribe()
      window.clearTimeout(timer.current)
      window.clearTimeout(retryTimer.current)
      window.clearTimeout(validateTimer)
      document.removeEventListener("visibilitychange", onHide)
      // Saindo com algo pendente, grava sem esperar. A tela já se foi; não há o que mostrar.
      if (api.getState().revision !== savedRevision.current && !inConflict.current) {
        void saveDefinition(flowRef.current.id, api.getState().serialize()).catch(() => undefined)
      }
    }
  }, [api, reactFlow, saveDefinition, updateFlow])

  // Alguém gravou depois de nós: outra aba ou outra pessoa.
  const draftAt = flow.draft?.updatedAt ?? 0
  useEffect(() => {
    if (draftAt <= stamp.current || inFlight.current || inConflict.current) return
    inConflict.current = true
    window.clearTimeout(timer.current)
    useEditorUi.setState({ saveStatus: "conflict" })
  }, [draftAt])

  return {
    /** Fica com o que está no servidor, e joga fora o que está aqui. */
    loadServer: () => {
      const definition = flowRef.current.draft?.definition ?? EMPTY
      stamp.current = flowRef.current.draft?.updatedAt ?? 0
      inConflict.current = false
      api.getState().replaceDefinition(prepareDefinition(definition))
      savedRevision.current = api.getState().revision
      useEditorUi.setState({ saveStatus: "saved" })
    },
    /** Fica com o que está aqui, e grava por cima. */
    keepMine: () => {
      stamp.current = flowRef.current.draft?.updatedAt ?? 0
      inConflict.current = false
      savedRevision.current = -1
      useEditorUi.setState({ saveStatus: "dirty" })
      void useEditorUi.getState().flush()
    },
  }
}
