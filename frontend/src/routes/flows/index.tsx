import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"
import { placeholderRoute } from "@/routes/placeholder"

const FlowsPage = lazy(() => import("./flows-page"))
const FlowEditorPage = lazy(() => import("./flow-editor-page"))
const FlowExecutionsPage = lazy(() => import("./flow-executions-page"))
const AutomationSettingsPage = lazy(() => import("./automation-settings-page"))

export const flowsRoutes = (
  <>
    <Route
      path="/flows"
      element={
        <RouteFrame title="navigation.flows" permission="flows">
          <FlowsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/flows/:flowId"
      element={
        <RouteFrame title="navigation.routes.flow" permission="flows">
          <FlowEditorPage />
        </RouteFrame>
      }
    />
    <Route
      path="/flows/:flowId/executions"
      element={
        <RouteFrame title="flows.executions.routeTitle" permission="flows">
          <FlowExecutionsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/automation-settings"
      element={
        <RouteFrame title="flows.settings.title" permission="flows">
          <AutomationSettingsPage />
        </RouteFrame>
      }
    />
    <Route path="/tools" element={placeholderRoute("navigation.routes.tools", "flows")} />
  </>
)
