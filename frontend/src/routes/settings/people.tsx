import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

const UsersPage = lazy(() => import("./people/users-page"))
const TeamsPage = lazy(() => import("./people/teams-page"))
const AccessRolesPage = lazy(() => import("./people/access-roles-page"))
const OrganizationPage = lazy(() => import("./people/organization-page"))
const ProfilePage = lazy(() => import("./people/profile-page"))
const NotificationsPage = lazy(() => import("./people/notifications-page"))

// `profile` e `notifications` são da própria pessoa: abertas a quem tem sessão,
// fora de `core_settings`. O caminho é relativo a `/settings`.
export const settingsPeopleRoutes = (
  <>
    <Route
      path="users"
      element={
        <RouteFrame title="navigation.users" permission="core_settings">
          <UsersPage />
        </RouteFrame>
      }
    />
    <Route
      path="teams"
      element={
        <RouteFrame title="navigation.routes.teams" permission="core_settings">
          <TeamsPage />
        </RouteFrame>
      }
    />
    <Route
      path="access-roles"
      element={
        <RouteFrame title="navigation.routes.accessRoles" permission="core_settings">
          <AccessRolesPage />
        </RouteFrame>
      }
    />
    <Route
      path="organization"
      element={
        <RouteFrame title="people.organization.title" permission="core_settings">
          <OrganizationPage />
        </RouteFrame>
      }
    />
    <Route
      path="profile"
      element={
        <RouteFrame title="navigation.routes.profile">
          <ProfilePage />
        </RouteFrame>
      }
    />
    <Route
      path="notifications"
      element={
        <RouteFrame title="navigation.routes.notificationSettings">
          <NotificationsPage />
        </RouteFrame>
      }
    />
  </>
)
