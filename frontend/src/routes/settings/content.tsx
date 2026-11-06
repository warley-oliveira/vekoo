import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const settingsContentRoutes = (
  <>
    <Route
      path="quick-replies"
      element={placeholderRoute("navigation.quickReplies", "core_settings")}
    />
    <Route
      path="attachments"
      element={placeholderRoute("navigation.attachments", "core_settings")}
    />
    <Route
      path="custom-fields"
      element={placeholderRoute("navigation.customFields", "core_settings")}
    />
  </>
)
