import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const funnelsRoutes = (
  <Route
    path="/funnels"
    element={placeholderRoute("navigation.funnels", "funnel")}
  />
)
