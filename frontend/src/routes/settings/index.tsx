import { Navigate, Route } from "react-router"

import { useCan } from "@/hooks/use-can"
import { settingsContentRoutes } from "@/routes/settings/content"
import { settingsIntegrationsRoutes } from "@/routes/settings/integrations"
import { settingsPeopleRoutes } from "@/routes/settings/people"
import { settingsWebhooksRoutes } from "@/routes/settings/webhooks"

/** `/settings` não tem tela própria: abre a primeira que a pessoa pode ver. */
function SettingsIndex() {
  const canManage = useCan("core_settings")
  return <Navigate to={canManage ? "users" : "profile"} replace />
}

// Um subarquivo por frente, para ninguém disputar este aqui.
export const settingsRoutes = (
  <Route path="/settings">
    <Route index element={<SettingsIndex />} />
    {settingsPeopleRoutes}
    {settingsContentRoutes}
    {settingsIntegrationsRoutes}
    {settingsWebhooksRoutes}
  </Route>
)
