import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useConfirm } from "@/components/shared"
import { sequencesKey, useSequenceMutations } from "@/hooks/calendar/use-attendance-sequences"
import { apiGet } from "@/lib/api"
import type { AttendanceSequence } from "@/lib/calendar/types"

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * O `PUT` substitui a lista inteira, e a API não tem controle de versão. Toda escrita relê a lista
 * e troca só a sequência em questão: a tela pode estar aberta há uma hora, e o que outra pessoa fez
 * em outra sequência não pode se perder. Se ela mexeu nesta mesma, quem está salvando decide.
 * Entre a leitura e a escrita ainda sobra um instante, que só a API poderia fechar.
 */
export function useSequenceList(calendarId: string) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { saveSequences } = useSequenceMutations(calendarId)

  const latest = useCallback(
    async () =>
      (await apiGet<{ attendanceSequences: AttendanceSequence[] }>(sequencesKey(calendarId)))
        .attendanceSequences,
    [calendarId]
  )

  /**
   * @param base a sequência como estava quando o painel abriu; `null` para uma nova.
   * @returns `false` se a pessoa preferiu não salvar por cima do que mudou.
   */
  const upsert = useCallback(
    async (next: AttendanceSequence, base: AttendanceSequence | null): Promise<boolean> => {
      const fresh = await latest()
      if (!base) {
        await saveSequences([...fresh, next])
        return true
      }

      const current = fresh.find((sequence) => sequence.id === base.id)
      if (!current) {
        const recreate = await confirm({
          title: t("calendar.sequences.conflict.deleted.title", { name: base.name }),
          description: t("calendar.sequences.conflict.deleted.description"),
          confirmLabel: t("calendar.sequences.conflict.deleted.confirm"),
        })
        if (!recreate) return false
        await saveSequences([...fresh, next])
        return true
      }

      if (!same(current, base)) {
        const overwrite = await confirm({
          title: t("calendar.sequences.conflict.changed.title", { name: base.name }),
          description: t("calendar.sequences.conflict.changed.description"),
          confirmLabel: t("calendar.sequences.conflict.changed.confirm"),
          cancelLabel: t("calendar.sequences.conflict.changed.cancel"),
          destructive: true,
        })
        if (!overwrite) return false
      }

      await saveSequences(fresh.map((sequence) => (sequence.id === base.id ? next : sequence)))
      return true
    },
    [confirm, latest, saveSequences, t]
  )

  const remove = useCallback(
    async (id: string | undefined) => {
      const fresh = await latest()
      await saveSequences(fresh.filter((sequence) => sequence.id !== id))
    },
    [latest, saveSequences]
  )

  /** @returns `false` se a sequência não existe mais. */
  const setEnabled = useCallback(
    async (id: string | undefined, enabled: boolean): Promise<boolean> => {
      const fresh = await latest()
      if (!fresh.some((sequence) => sequence.id === id)) {
        await saveSequences(fresh)
        return false
      }
      await saveSequences(
        fresh.map((sequence) => (sequence.id === id ? { ...sequence, enabled } : sequence))
      )
      return true
    },
    [latest, saveSequences]
  )

  return useMemo(() => ({ upsert, remove, setEnabled }), [remove, setEnabled, upsert])
}
