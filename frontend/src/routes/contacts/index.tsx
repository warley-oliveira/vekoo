import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const contactsRoutes = (
  <Route
    path="/contacts"
    element={placeholderRoute("navigation.contacts", "contacts")}
  />
)
