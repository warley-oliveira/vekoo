import { lazy, Suspense, type ReactNode } from "react"
import { Navigate, Route, Routes } from "@/lib/router"

import {
  AuthSplash,
  RedirectIfAuthenticated,
  RequireAuth,
} from "@/components/auth-guard"
import { AccountRedirect, AccountScope } from "@/components/organizations/account-scope"
import { RootRedirect } from "@/components/require-permission"
import { RouteBoundary } from "@/components/shell/route-boundary"
import { calendarRoutes } from "@/routes/calendar"
import { campaignsRoutes } from "@/routes/campaigns"
import { campaignWizardRoutes } from "@/routes/campaigns/wizard"
import { carouselsRoutes } from "@/routes/carousels"
import { catalogRoutes } from "@/routes/catalog"
import { chatRoutes } from "@/routes/chat"
import { contactsRoutes } from "@/routes/contacts"
import { dashboardRoutes } from "@/routes/dashboard"
import { devRoutes } from "@/routes/dev-routes"
import { flowsRoutes } from "@/routes/flows"
import { funnelsRoutes } from "@/routes/funnels"
import { pipelinesRoutes } from "@/routes/pipelines"
import { pipelineAdminRoutes } from "@/routes/pipelines/admin"
import { settingsRoutes } from "@/routes/settings"
import { instagramCallbackRoute } from "@/routes/settings/integrations"

// As rotas da plataforma moram em `routes/<dominio>/index.tsx`, cada uma um fragmento
// de `<Route>`, com a página em `lazy()`. Quem traz uma tela nova mexe no arquivo do
// seu domínio, não aqui. A casca e as telas de entrada também são `lazy`, para o
// primeiro carregamento levar só o que aquela pessoa vai usar.
//
// Toda tela da plataforma mora dentro de uma organização: `/a/<hashid>/...`, o hashid do
// vínculo da pessoa com ela. As rotas de domínio continuam escritas sem o prefixo (`/chat`):
// elas casam dentro de `/a/:account/*`, e `lib/router` põe o prefixo nos links. Fora dele
// ficam a entrada, a conta e a escolha de organização (`/organizations`).

const AppShell = lazy(() =>
  import("@/components/app-shell").then((m) => ({ default: m.AppShell }))
)
const EditorPage = lazy(() =>
  import("@/routes/editor").then((m) => ({ default: m.EditorPage }))
)
const LoginPage = lazy(() =>
  import("@/routes/login").then((m) => ({ default: m.LoginPage }))
)
const SignUpPage = lazy(() =>
  import("@/routes/signup").then((m) => ({ default: m.SignUpPage }))
)
const ForgotPasswordPage = lazy(() =>
  import("@/routes/forgot-password").then((m) => ({
    default: m.ForgotPasswordPage,
  }))
)
const ResetPasswordPage = lazy(() =>
  import("@/routes/reset-password").then((m) => ({
    default: m.ResetPasswordPage,
  }))
)
const OrganizationsPage = lazy(() =>
  import("@/routes/organizations").then((m) => ({ default: m.OrganizationsPage }))
)

/** Tela inteira carregando: entrada, editor e a própria casca. */
function FullScreen({ children }: { children: ReactNode }) {
  return (
    <RouteBoundary>
      <Suspense fallback={<AuthSplash />}>{children}</Suspense>
    </RouteBoundary>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Fora da sessão */}
      <Route element={<RedirectIfAuthenticated />}>
        <Route
          path="/login"
          element={
            <FullScreen>
              <LoginPage />
            </FullScreen>
          }
        />
        <Route
          path="/signup"
          element={
            <FullScreen>
              <SignUpPage />
            </FullScreen>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <FullScreen>
              <ForgotPasswordPage />
            </FullScreen>
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <FullScreen>
              <ResetPasswordPage />
            </FullScreen>
          }
        />
      </Route>

      {/* Janela de passagem do login do Instagram: sem guarda, para não perder o código. */}
      {instagramCallbackRoute}

      {/* Dentro da sessão */}
      <Route element={<RequireAuth />}>
        {/* Escolher a organização: da pessoa, não de uma organização */}
        <Route
          path="/organizations"
          element={
            <FullScreen>
              <OrganizationsPage />
            </FullScreen>
          }
        />
        <Route
          path="/a/:account/*"
          element={
            <AccountScope>
              <PlatformRoutes />
            </AccountScope>
          }
        />
        {/* `/` e os links de antes da organização na URL */}
        <Route path="*" element={<AccountRedirect />} />
      </Route>
    </Routes>
  )
}

/** As telas de uma organização, sem o prefixo `/a/:account` (ver o comentário do topo). */
function PlatformRoutes() {
  return (
    <Routes>
      {/* Editor em tela cheia — fora do AppShell de propósito */}
      <Route
        path="/carousels/:carouselId/edit"
        element={
          <FullScreen>
            <EditorPage />
          </FullScreen>
        }
      />
      <Route
        element={
          <FullScreen>
            <AppShell />
          </FullScreen>
        }
      >
        <Route path="/" element={<RootRedirect />} />
        {dashboardRoutes}
        {flowsRoutes}
        {calendarRoutes}
        {pipelineAdminRoutes}
        {pipelinesRoutes}
        {chatRoutes}
        {contactsRoutes}
        {catalogRoutes}
        {funnelsRoutes}
        {campaignWizardRoutes}
        {campaignsRoutes}
        {carouselsRoutes}
        {settingsRoutes}
        {devRoutes}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
