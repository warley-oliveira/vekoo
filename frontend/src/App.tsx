import { lazy, Suspense, type ReactNode } from "react"
import { Navigate, Route, Routes } from "react-router"

import {
  AuthSplash,
  RedirectIfAuthenticated,
  RequireAuth,
} from "@/components/auth-guard"
import { RootRedirect } from "@/components/require-permission"
import { RouteBoundary } from "@/components/shell/route-boundary"
import { calendarRoutes } from "@/routes/calendar"
import { campaignsRoutes } from "@/routes/campaigns"
import { carouselsRoutes } from "@/routes/carousels"
import { catalogRoutes } from "@/routes/catalog"
import { chatRoutes } from "@/routes/chat"
import { contactsRoutes } from "@/routes/contacts"
import { dashboardRoutes } from "@/routes/dashboard"
import { devRoutes } from "@/routes/dev-routes"
import { flowsRoutes } from "@/routes/flows"
import { funnelsRoutes } from "@/routes/funnels"
import { pipelinesRoutes } from "@/routes/pipelines"
import { settingsRoutes } from "@/routes/settings"

// As rotas da plataforma moram em `routes/<dominio>/index.tsx`, cada uma um fragmento
// de `<Route>`, com a página em `lazy()`. Quem traz uma tela nova mexe no arquivo do
// seu domínio, não aqui. A casca e as telas de entrada também são `lazy`, para o
// primeiro carregamento levar só o que aquela pessoa vai usar.

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

      {/* Dentro da sessão */}
      <Route element={<RequireAuth />}>
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
          {pipelinesRoutes}
          {chatRoutes}
          {contactsRoutes}
          {catalogRoutes}
          {funnelsRoutes}
          {campaignsRoutes}
          {carouselsRoutes}
          {settingsRoutes}
          {devRoutes}
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
