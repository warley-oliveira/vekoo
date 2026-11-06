import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const flowsRoutes = (
  <>
    <Route path="/flows" element={placeholderRoute("navigation.flows", "flows")} />
    <Route
      path="/flows/:flowId"
      element={placeholderRoute("navigation.routes.flow", "flows")}
    />
    <Route path="/tools" element={placeholderRoute("navigation.routes.tools", "flows")} />
  </>
)
