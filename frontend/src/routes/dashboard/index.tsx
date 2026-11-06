import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const dashboardRoutes = (
  <Route
    path="/dashboard"
    element={placeholderRoute("navigation.dashboard", "dashboard")}
  />
)
