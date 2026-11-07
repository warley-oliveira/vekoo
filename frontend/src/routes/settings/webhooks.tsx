import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

const WebhooksPage = lazy(() => import("./webhooks/webhooks-page"))
const WebhookLogsPage = lazy(() => import("./webhooks/webhook-logs-page"))
const WebhookPage = lazy(() => import("./webhooks/webhook-page"))

// O caminho é relativo a `/settings`. Tudo aqui pede `core_settings`, inclusive o histórico: o menu já esconde de quem não
// tem, e quem chegar pelo endereço volta com um aviso, em vez de ver a tela falhar.
export const settingsWebhooksRoutes = (
  <>
    <Route
      path="webhooks"
      element={
        <RouteFrame title="navigation.webhooks" permission="core_settings">
          <WebhooksPage />
        </RouteFrame>
      }
    />
    <Route
      path="webhooks/logs"
      element={
        <RouteFrame title="navigation.webhooks" permission="core_settings">
          <WebhookLogsPage />
        </RouteFrame>
      }
    />
    <Route
      path="webhooks/:webhookId"
      element={
        <RouteFrame title="webhooks.detail.routeTitle" permission="core_settings">
          <WebhookPage />
        </RouteFrame>
      }
    />
  </>
)
