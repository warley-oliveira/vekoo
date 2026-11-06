import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const calendarRoutes = (
  <>
    <Route
      path="/calendar"
      element={placeholderRoute("navigation.calendar", "calendar")}
    />
    <Route
      path="/calendar/google-callback"
      element={placeholderRoute("navigation.routes.googleCallback", "calendar")}
    />
    <Route
      path="/calendar/:calendarId/*"
      element={placeholderRoute("navigation.calendar", "calendar")}
    />
  </>
)
