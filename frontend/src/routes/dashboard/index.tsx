import { lazy } from "react"
import { Route } from "@/lib/router"

import { RouteFrame } from "@/components/shell/route-frame"

const DashboardPage = lazy(() => import("./dashboard-page"))

export const dashboardRoutes = (
  <Route
    path="/dashboard"
    element={
      <RouteFrame title="navigation.dashboard" permission="dashboard">
        <DashboardPage />
      </RouteFrame>
    }
  />
)
