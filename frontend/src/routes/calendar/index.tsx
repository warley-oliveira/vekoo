import { lazy } from "react"
import { Route } from "@/lib/router"

import { RouteFrame } from "@/components/shell/route-frame"

const CalendarPage = lazy(() => import("./calendar-page"))
const GoogleCallbackPage = lazy(() => import("./google-callback-page"))
const CalendarAreaLayout = lazy(() => import("./area/area-layout"))

export const calendarRoutes = (
  <>
    <Route
      path="/calendar"
      element={
        <RouteFrame title="navigation.calendar" permission="calendar">
          <CalendarPage />
        </RouteFrame>
      }
    />
    <Route
      path="/calendar/google-callback"
      element={
        <RouteFrame title="navigation.routes.googleCallback" permission="calendar">
          <GoogleCallbackPage />
        </RouteFrame>
      }
    />
    <Route
      path="/calendar/:calendarId/*"
      element={
        <RouteFrame title="navigation.calendar" permission="calendar">
          <CalendarAreaLayout />
        </RouteFrame>
      }
    />
  </>
)
