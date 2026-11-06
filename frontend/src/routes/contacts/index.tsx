import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

const ContactsPage = lazy(() => import("./contacts-page"))

export const contactsRoutes = (
  <Route
    path="/contacts"
    element={
      <RouteFrame title="navigation.contacts" permission="contacts">
        <ContactsPage />
      </RouteFrame>
    }
  />
)
