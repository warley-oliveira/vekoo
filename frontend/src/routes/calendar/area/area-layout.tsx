import { lazy, Suspense, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { CalendarX2 } from "lucide-react"
import { Navigate, Route, Routes, useNavigate, useParams } from "@/lib/router"

import { CalendarAreaContext } from "@/components/calendar/area/area-context"
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
} from "@/components/shared"
import { AreaNav } from "@/components/shared/area-nav"
import { Skeleton } from "@/components/ui/skeleton"
import { useCalendar } from "@/hooks/calendar/use-calendars"
import { usePageTitle } from "@/hooks/use-header-slot"
import { ApiError } from "@/lib/api"
import type { AgendaCalendar } from "@/lib/calendar/types"

const SettingsPage = lazy(() => import("./settings-page"))
const CollaboratorsPage = lazy(() => import("./collaborators-page"))
const ClassGroupsPage = lazy(() => import("./class-groups-page"))
const ServicesPage = lazy(() => import("./services-page"))
const SequencesPage = lazy(() => import("./sequences-page"))

/** Calendário de turmas não tem colaboradores nem sequências; o de colaboradores não tem turmas. */
function areasOf(calendar: AgendaCalendar) {
  return calendar.calendarType === "class_group"
    ? (["settings", "class-groups", "services"] as const)
    : (["settings", "collaborators", "services", "sequences"] as const)
}

const AREA_LABEL = {
  settings: "calendar.area.nav.settings",
  collaborators: "calendar.area.nav.collaborators",
  "class-groups": "calendar.area.nav.classGroups",
  services: "calendar.area.nav.services",
  sequences: "calendar.area.nav.sequences",
} as const

function AreaSkeleton() {
  return (
    <PageBody>
      <div aria-hidden className="flex gap-4 border-b pb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <CardGridSkeleton cards={6} />
    </PageBody>
  )
}

/**
 * As áreas de um calendário: configurações, colaboradores, turmas, serviços e sequências. Cada aba
 * tem a sua rota, e o título da barra superior é o nome do calendário, com o caminho de volta.
 */
export default function CalendarAreaLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { calendarId } = useParams()
  const { calendar, error, isLoading, reload } = useCalendar(calendarId)

  usePageTitle(calendar?.name, {
    color: calendar?.color ?? undefined,
    backTo: "/calendar",
    parentTitle: t("navigation.calendar"),
  })

  const context = useMemo(() => (calendar ? { calendar, reload } : null), [calendar, reload])

  if (isLoading && !calendar) return <AreaSkeleton />

  if (error || !calendar || !context) {
    if (error instanceof ApiError && error.status !== 404) {
      return (
        <PageBody>
          <ErrorState error={error} onRetry={() => reload()} />
        </PageBody>
      )
    }
    return (
      <PageBody>
        <EmptyState
          icon={<CalendarX2 />}
          title={t("calendar.area.notFound.title")}
          description={t("calendar.area.notFound.description")}
          action={{
            label: t("calendar.area.notFound.back"),
            onClick: () => navigate("/calendar"),
          }}
        />
      </PageBody>
    )
  }

  const areas = areasOf(calendar)

  return (
    <CalendarAreaContext.Provider value={context}>
      <PageBody>
        <PageHeader />
        <AreaNav
          label={t("calendar.area.nav.aria")}
          items={areas.map((area) => ({
            to: `/calendar/${calendar.id}/${area}`,
            label: t(AREA_LABEL[area]),
          }))}
        />
        <Suspense fallback={<CardGridSkeleton cards={6} />}>
          <Routes>
            <Route index element={<Navigate to="settings" replace />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="services" element={<ServicesPage />} />
            {calendar.calendarType === "class_group" ? (
              <Route path="class-groups" element={<ClassGroupsPage />} />
            ) : (
              <>
                <Route path="collaborators" element={<CollaboratorsPage />} />
                <Route path="sequences" element={<SequencesPage />} />
              </>
            )}
            <Route path="*" element={<Navigate to={`/calendar/${calendar.id}/settings`} replace />} />
          </Routes>
        </Suspense>
      </PageBody>
    </CalendarAreaContext.Provider>
  )
}
