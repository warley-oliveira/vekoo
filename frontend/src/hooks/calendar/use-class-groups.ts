import { useCallback, useMemo } from "react"
import useSWR, { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, type PaginationMeta } from "@/lib/api"
import type {
  AttendanceStatus,
  AttendanceSummary,
  ChatLookupItem,
  ClassAttendance,
  ClassEnrollment,
  ClassGroup,
  ClassGroupInput,
  ScheduleWindowOption,
} from "@/lib/calendar/types"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"
import { useRevalidateEvents } from "./use-calendar-events"

export function classGroupsKey(calendarId: string): string {
  return `/calendars/${calendarId}/class-groups?perPage=100`
}

export function useClassGroups(calendarId: string | null | undefined) {
  const key = calendarId ? classGroupsKey(calendarId) : null
  const { data, error, isLoading, mutate } = useSWR<ClassGroup[]>(key, () =>
    fetchAllPages<ClassGroup>(key as string, "classGroups")
  )
  return { classGroups: data, error, isLoading, reload: () => mutate() }
}

/** Mudar a grade de uma turma muda as aulas: a grade do calendário relê junto. */
export function useClassGroupMutations(calendarId: string) {
  const { mutate } = useSWRConfig()
  const revalidateEvents = useRevalidateEvents()

  const revalidate = useCallback(async () => {
    await mutate(
      (key) => typeof key === "string" && key.startsWith(`/calendars/${calendarId}/class-groups`)
    )
    void revalidateEvents()
  }, [calendarId, mutate, revalidateEvents])

  const createClassGroup = useCallback(
    async (input: ClassGroupInput) => {
      const saved = await apiPost<ClassGroup>(`/calendars/${calendarId}/class-groups`, {
        classGroup: input,
      })
      await revalidate()
      return saved
    },
    [calendarId, revalidate]
  )

  const updateClassGroup = useCallback(
    async (id: string, input: ClassGroupInput) => {
      const saved = await apiPatch<ClassGroup>(`/calendars/${calendarId}/class-groups/${id}`, {
        classGroup: input,
      })
      await revalidate()
      return saved
    },
    [calendarId, revalidate]
  )

  /** Leva as inscrições, as aulas com documento e as presenças. */
  const deleteClassGroup = useCallback(
    async (id: string) => {
      await apiDelete(`/calendars/${calendarId}/class-groups/${id}`)
      await revalidate()
    },
    [calendarId, revalidate]
  )

  return useMemo(
    () => ({ createClassGroup, updateClassGroup, deleteClassGroup }),
    [createClassGroup, deleteClassGroup, updateClassGroup]
  )
}

/* ---------- inscrições ---------- */

type EnrollmentsResponse = {
  enrollments: ClassEnrollment[]
  activeCount: number
  maxStudents: number | null
  meta: PaginationMeta
}

export function enrollmentsKey(calendarId: string, classGroupId: string): string {
  return `/calendars/${calendarId}/class-groups/${classGroupId}/enrollments?perPage=100`
}

export function useClassEnrollments(
  calendarId: string | null | undefined,
  classGroupId: string | null | undefined
) {
  const key = calendarId && classGroupId ? enrollmentsKey(calendarId, classGroupId) : null
  const { data, error, isLoading, mutate } = useApi<EnrollmentsResponse>(key)
  return {
    enrollments: data?.enrollments,
    activeCount: data?.activeCount ?? 0,
    maxStudents: data?.maxStudents ?? null,
    error,
    isLoading,
    reload: () => mutate(),
  }
}

export function useEnrollmentMutations(calendarId: string, classGroupId: string) {
  const { mutate } = useSWRConfig()
  const revalidateEvents = useRevalidateEvents()

  const revalidate = useCallback(async () => {
    await mutate(
      (key) => typeof key === "string" && key.startsWith(`/calendars/${calendarId}/class-groups`)
    )
    void revalidateEvents()
  }, [calendarId, mutate, revalidateEvents])

  /** Turma cheia: `classGroupFull`. Já inscrito: 422 em `chatId`. */
  const enroll = useCallback(
    async (chatId: string) => {
      const saved = await apiPost<ClassEnrollment>(
        `/calendars/${calendarId}/class-groups/${classGroupId}/enrollments`,
        { chatId }
      )
      await revalidate()
      return saved
    },
    [calendarId, classGroupId, revalidate]
  )

  /** Cancela todas as inscrições ativas do mesmo contato nesta turma. */
  const unenroll = useCallback(
    async (enrollmentId: string) => {
      await apiDelete(
        `/calendars/${calendarId}/class-groups/${classGroupId}/enrollments/${enrollmentId}`
      )
      await revalidate()
    },
    [calendarId, classGroupId, revalidate]
  )

  return useMemo(() => ({ enroll, unenroll }), [enroll, unenroll])
}

/* ---------- presença ---------- */

export function attendancesKey(sessionId: string): string {
  return `/class-sessions/${sessionId}/attendances`
}

/** O id da aula pode ser o calculado (`vcs_...`): a API o aceita mesmo depois de gravada. */
export function useClassAttendances(sessionId: string | null | undefined) {
  const { data, error, isLoading, mutate } = useApi<{ attendances: ClassAttendance[] }>(
    sessionId ? attendancesKey(sessionId) : null
  )
  return { attendances: data?.attendances, error, isLoading, reload: () => mutate() }
}

export function useAttendanceMutations(sessionId: string) {
  const { mutate } = useSWRConfig()
  const key = attendancesKey(sessionId)

  const setList = useCallback(
    (update: (list: ClassAttendance[]) => ClassAttendance[]) =>
      mutate<{ attendances: ClassAttendance[] }>(
        key,
        (current) => (current ? { attendances: update(current.attendances) } : current),
        { revalidate: false }
      ),
    [key, mutate]
  )

  /** Marcar na hora; se a API recusar, volta como estava. */
  const setStatus = useCallback(
    async (attendance: ClassAttendance, attendanceStatus: AttendanceStatus | null) => {
      void setList((list) =>
        list.map((item) => (item.id === attendance.id ? { ...item, attendanceStatus } : item))
      )
      try {
        const saved = await apiPut<ClassAttendance>(`${key}/${attendance.id}`, { attendanceStatus })
        // `ve_...` vira um registro de verdade, com id próprio.
        void setList((list) => list.map((item) => (item.id === attendance.id ? saved : item)))
        return saved
      } catch (cause) {
        void setList((list) =>
          list.map((item) =>
            item.id === attendance.id
              ? { ...item, attendanceStatus: attendance.attendanceStatus }
              : item
          )
        )
        throw cause
      }
    },
    [key, setList]
  )

  /** Marca todos os inscritos do horário. `null` desmarca. */
  const setAll = useCallback(
    async (attendanceStatus: AttendanceStatus | null) => {
      const result = await apiPost<{ attendanceSummary: AttendanceSummary }>(
        `${key}/bulk-update`,
        { attendanceStatus }
      )
      await mutate(key)
      return result
    },
    [key, mutate]
  )

  /** Convidado, só nesta aula. Repetido: `alreadyInSession`. */
  const addGuest = useCallback(
    async (chatId: string) => {
      const saved = await apiPost<ClassAttendance>(key, { chatId })
      await mutate(key)
      return saved
    },
    [key, mutate]
  )

  /** Inscreve nos horários escolhidos (sem `slots`, no horário desta aula). */
  const enrollInSlots = useCallback(
    async (chatId: string, slots: { dayOfWeek: number; windowStart: string }[]) => {
      const result = await apiPost<{ enrolledAll: boolean; enrollmentsCreated: number }>(key, {
        chatId,
        enrollAll: true,
        slots,
      })
      await mutate(key)
      return result
    },
    [key, mutate]
  )

  const removeAttendance = useCallback(
    async (attendanceId: string) => {
      await apiDelete(`${key}/${attendanceId}`)
      await mutate(key)
    },
    [key, mutate]
  )

  const fetchSchedule = useCallback(
    () => apiGet<{ windows: ScheduleWindowOption[] }>(`${key}/schedule`),
    [key]
  )

  return useMemo(
    () => ({ setStatus, setAll, addGuest, enrollInSlots, removeAttendance, fetchSchedule }),
    [addGuest, enrollInSlots, fetchSchedule, removeAttendance, setAll, setStatus]
  )
}

/* ---------- busca de contato ---------- */

/** Até 10, só o necessário para escolher, e respeita o que a pessoa pode ver no chat. */
export async function lookupChats(query: string, signal?: AbortSignal): Promise<ChatLookupItem[]> {
  const { chats } = await apiGet<{ chats: ChatLookupItem[] }>(
    `/chats/lookup?q=${encodeURIComponent(query)}`,
    { signal }
  )
  return chats
}

export function chatDisplayName(chat: Pick<ChatLookupItem, "userName" | "displayName">): string {
  return chat.displayName || chat.userName || ""
}
