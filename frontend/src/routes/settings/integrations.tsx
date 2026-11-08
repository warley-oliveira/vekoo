import { lazy, Suspense } from "react"
import { Route } from "@/lib/router"

import { AuthSplash } from "@/components/auth-guard"
import { RouteFrame } from "@/components/shell/route-frame"
import { RouteBoundary } from "@/components/shell/route-boundary"
import { INSTAGRAM_CALLBACK_PATH } from "@/lib/connectors/instagram-oauth"

const ConnectorsPage = lazy(() => import("./integrations/connectors-page"))
const ConnectorPage = lazy(() => import("./integrations/connector-page"))
const InstagramCallbackPage = lazy(() => import("./integrations/instagram-callback-page"))

// A leitura de `/connectors` é aberta, porque o chat precisa dos canais. Esta área é de
// quem configura: é a permissão que também libera o QR code.
export const settingsIntegrationsRoutes = (
  <>
    <Route
      path="integrations"
      element={
        <RouteFrame title="navigation.integrations" permission="core_settings">
          <ConnectorsPage />
        </RouteFrame>
      }
    />
    <Route
      path="integrations/:connectorId"
      element={
        <RouteFrame title="navigation.routes.connector" permission="core_settings">
          <ConnectorPage />
        </RouteFrame>
      }
    />
  </>
)

/**
 * A volta do login do Instagram, fora do `RequireAuth` e da casca: é uma janela de
 * passagem. Ver `instagram-callback-page.tsx`. O caminho é o que está registrado na Meta.
 */
export const instagramCallbackRoute = (
  <Route
    path={INSTAGRAM_CALLBACK_PATH}
    element={
      <RouteBoundary>
        <Suspense fallback={<AuthSplash />}>
          <InstagramCallbackPage />
        </Suspense>
      </RouteBoundary>
    }
  />
)
