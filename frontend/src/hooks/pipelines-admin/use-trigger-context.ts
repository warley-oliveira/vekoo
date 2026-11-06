import { createContext, useContext, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useConnectors } from "@/hooks/connectors/use-connectors"
import { usePeople } from "@/hooks/people/use-people"
import { useCan } from "@/hooks/use-can"
import type { SelectOption } from "@/components/shared"
import { useLanguage } from "@/lib/i18n"
import type { Connector } from "@/lib/connectors/types"
import { formatPeriod, type SentenceLookups } from "@/lib/pipelines-admin/trigger-sentence"
import type { Board, BoardCard, BoardOption } from "@/lib/pipelines-admin/types"
import { useBoardOptions } from "./use-board"

export type TriggerContextValue = {
  board: Board
  /** A API exige `flows` para gravar gatilho com código. */
  canUseCode: boolean
  lookups: SentenceLookups
  stageOptions: SelectOption[]
  /** Quem pode receber card. Quem perdeu o acesso aparece desativado, para não sumir de um gatilho antigo. */
  peopleOptions: SelectOption[]
  connectors: Connector[]
  otherBoards: BoardOption[]
  /** Um card de verdade, para a prévia das mensagens. */
  sampleCard: BoardCard | null
}

const TriggerContext = createContext<TriggerContextValue | null>(null)

export const TriggerContextProvider = TriggerContext.Provider

export function useTriggerContext(): TriggerContextValue {
  const context = useContext(TriggerContext)
  if (!context) throw new Error("useTriggerContext fora de TriggerContextProvider")
  return context
}

export function useTriggerContextValue(board: Board): TriggerContextValue {
  const { t } = useTranslation()
  const language = useLanguage()
  const canUseCode = useCan("flows")
  const { people } = usePeople()
  const { data: connectorData } = useConnectors({ revalidateOnFocus: false })
  const { boards } = useBoardOptions()

  return useMemo(() => {
    const stagesById = new Map(board.stages.map((stage) => [stage.id, stage.name]))
    const peopleById = new Map((people ?? []).map((person) => [person.id, person]))
    const boardsById = new Map((boards ?? []).map((item) => [item.id, item.name]))
    const listFormat = new Intl.ListFormat(language, { style: "long", type: "conjunction" })

    const lookups: SentenceLookups = {
      language,
      stageName: (id) => (id ? (stagesById.get(id) ?? null) : null),
      personName: (id) => (id ? (peopleById.get(id)?.name ?? null) : null),
      boardName: (id) => (id ? (boardsById.get(id) ?? null) : null),
      priorityLabel: (value) => t(`pipelinesAdmin.priorities.${value}`, { defaultValue: value }),
      list: (items) => listFormat.format(items),
      conditionField: (key) => t(`pipelinesAdmin.triggers.conditionFields.${key}`, { defaultValue: key }),
      conditionOperator: (operator) => t(`pipelinesAdmin.triggers.operators.${operator}`),
      period: (time, period) => formatPeriod(time, period, language),
    }

    const stageOptions = board.stages.map((stage) => ({ value: stage.id, label: stage.name }))

    const peopleOptions = (people ?? [])
      .map((person) => {
        const off = Boolean(person.revokedAt) || person.setupOnly
        return {
          value: person.id,
          label: person.revokedAt ? t("pipelinesAdmin.triggers.personNoAccess", { name: person.name }) : person.name,
          description: person.email,
          disabled: off,
        }
      })
      .sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.label.localeCompare(b.label, language))

    const sampleCard =
      board.stages
        .flatMap((stage) => stage.cards)
        .find((card) => card.companyName && card.assignedTo) ??
      board.stages.flatMap((stage) => stage.cards)[0] ??
      null

    return {
      board,
      canUseCode,
      lookups,
      stageOptions,
      peopleOptions,
      connectors: connectorData?.connectors ?? [],
      otherBoards: (boards ?? []).filter((item) => item.id !== board.id),
      sampleCard,
    }
  }, [board, boards, canUseCode, connectorData?.connectors, language, people, t])
}
