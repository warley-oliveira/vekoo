import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const settingsWebhooksRoutes = (
  <Route
    path="webhooks"
    element={placeholderRoute("navigation.webhooks", "core_settings")}
  />
)
