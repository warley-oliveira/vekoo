import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const settingsIntegrationsRoutes = (
  <>
    <Route
      path="integrations"
      element={placeholderRoute("navigation.integrations", "core_settings")}
    />
    <Route
      path="integrations/:connectorId"
      element={placeholderRoute("navigation.routes.connector", "core_settings")}
    />
  </>
)
