import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

const FunnelsPage = lazy(() => import("./funnels-page"))

export const funnelsRoutes = (
  <Route
    path="/funnels"
    element={
      <RouteFrame title="navigation.funnels" permission="funnel">
        <FunnelsPage />
      </RouteFrame>
    }
  />
)
