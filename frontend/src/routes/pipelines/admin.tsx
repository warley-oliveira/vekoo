import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

const SettingsPage = lazy(() => import("./admin/settings-page"))
const TriggersPage = lazy(() => import("./admin/triggers-page"))
const GoalsPage = lazy(() => import("./admin/goals-page"))
const FieldsPage = lazy(() => import("./admin/fields-page"))
const LabelsPage = lazy(() => import("./admin/labels-page"))
const MetricsPage = lazy(() => import("./admin/metrics-page"))
const ArchivedPage = lazy(() => import("./admin/archived-page"))

/**
 * A administração de um quadro: o que configura e mede. Caminhos absolutos, para entrar como
 * irmãos de `<Route path="/pipelines">`, e não dentro dele: a página do quadro não tem `Outlet`.
 * O caminho fixo ganha de `/pipelines/:boardId/:view` na ordem do roteador.
 *
 *     export const pipelinesRoutes = (
 *       <>
 *         {pipelineAdminRoutes}
 *         <Route path="/pipelines" element={...}>...</Route>
 *       </>
 *     )
 */
export const pipelineAdminRoutes = (
  <>
    <Route
      path="/pipelines/:boardId/settings"
      element={
        <RouteFrame title="pipelinesAdmin.routes.settings" permission="pipelines">
          <SettingsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/pipelines/:boardId/settings/triggers"
      element={
        <RouteFrame title="pipelinesAdmin.routes.triggers" permission="pipelines">
          <TriggersPage />
        </RouteFrame>
      }
    />
    <Route
      path="/pipelines/:boardId/settings/goals"
      element={
        <RouteFrame title="pipelinesAdmin.routes.goals" permission="pipelines">
          <GoalsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/pipelines/:boardId/settings/fields"
      element={
        <RouteFrame title="pipelinesAdmin.routes.fields" permission="pipelines">
          <FieldsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/pipelines/:boardId/settings/labels"
      element={
        <RouteFrame title="pipelinesAdmin.routes.labels" permission="pipelines">
          <LabelsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/pipelines/:boardId/metrics"
      element={
        <RouteFrame title="pipelinesAdmin.routes.metrics" permission="pipelines">
          <MetricsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/pipelines/:boardId/archived"
      element={
        <RouteFrame title="pipelinesAdmin.routes.archived" permission="pipelines">
          <ArchivedPage />
        </RouteFrame>
      }
    />
  </>
)
