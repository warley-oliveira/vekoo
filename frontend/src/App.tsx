import { Navigate, Route, Routes } from "react-router"

import { AppShell } from "@/components/app-shell"
import { RedirectIfAuthenticated, RequireAuth } from "@/components/auth-guard"
import { BrandPage } from "@/routes/brand"
import { BrandGate } from "@/routes/brand-gate"
import { BrandLayout } from "@/routes/brand-layout"
import { BrandSetupPage } from "@/routes/brand-setup"
import { TemplatesPage } from "@/routes/coming-soon"
import { ContentsPage } from "@/routes/contents"
import { CreatePage } from "@/routes/create"
import { BrandDashboardPage } from "@/routes/dashboard"
import { EditorPage } from "@/routes/editor"
import { ForgotPasswordPage } from "@/routes/forgot-password"
import { LoginPage } from "@/routes/login"
import { MyCarouselsPage } from "@/routes/my-carousels"
import { OnboardingPage } from "@/routes/onboarding"
import { OrphansPage } from "@/routes/orphans"
import { PiecePage } from "@/routes/piece"
import { PieceNewPage } from "@/routes/piece-new"
import { ResetPasswordPage } from "@/routes/reset-password"
import { SignUpPage } from "@/routes/signup"
import { TrashPage } from "@/routes/trash"

// A marca é o contexto raiz: tudo que a pessoa faz vive sob `/brands/:brandId`.
// A raiz (`/`) só escolhe a marca ativa e redireciona.

export default function App() {
  return (
    <Routes>
      {/* Fora da sessão */}
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      </Route>

      {/* Dentro da sessão */}
      <Route element={<RequireAuth />}>
        <Route path="/" element={<BrandGate />} />
        <Route path="/brands" element={<BrandGate />} />

        {/* Migração do legado — rota isolada, some quando os órfãos zeram. */}
        <Route path="/migration/orphans" element={<OrphansPage />} />

        <Route path="/brands/:brandId" element={<BrandLayout />}>
          {/* Editor em tela cheia — fora do AppShell de propósito */}
          <Route path="carousels/:carouselId/edit" element={<EditorPage />} />
          {/* Onboarding também em tela cheia: uma conversa, sem menu lateral
              disputando a atenção de quem ainda não tem uma marca. O
              `/:step` era o onboarding de telas — o link antigo cai na
              conversa, que retoma sozinha de onde parou. */}
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="onboarding/:step" element={<Navigate to=".." relative="path" replace />} />
          <Route element={<AppShell />}>
            <Route index element={<BrandDashboardPage />} />
            <Route path="carousels" element={<MyCarouselsPage />} />
            <Route path="folders/:folderId" element={<MyCarouselsPage />} />
            <Route path="contents" element={<ContentsPage />} />
            <Route path="contents/:pieceId" element={<PiecePage />} />
            {/* A criação por conversa é o caminho principal. */}
            <Route path="create" element={<CreatePage />} />
            <Route path="create/:conversationId" element={<CreatePage />} />
            {/* Modo avançado: o catálogo de motores e o formulário do manifesto.
                Continua existindo para quem sabe o que quer — e para a própria
                operação da Vekoo —, atrás de um link discreto. */}
            <Route path="advanced" element={<PieceNewPage />} />
            <Route path="advanced/:engineId" element={<PieceNewPage />} />
            <Route path="settings" element={<BrandPage />} />
            <Route path="setup" element={<BrandSetupPage />} />
            <Route path="setup/:step" element={<BrandSetupPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="trash" element={<TrashPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
