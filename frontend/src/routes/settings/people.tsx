import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

// `profile` e `notifications` são da própria pessoa: abertas a quem tem sessão,
// fora de `core_settings`. O caminho é relativo a `/settings`.
export const settingsPeopleRoutes = (
  <>
    <Route
      path="users"
      element={placeholderRoute("navigation.users", "core_settings")}
    />
    <Route
      path="teams"
      element={placeholderRoute("navigation.routes.teams", "core_settings")}
    />
    <Route
      path="access-roles"
      element={placeholderRoute("navigation.routes.accessRoles", "core_settings")}
    />
    <Route path="profile" element={placeholderRoute("navigation.routes.profile")} />
    <Route
      path="notifications"
      element={placeholderRoute("navigation.routes.notificationSettings")}
    />
  </>
)
