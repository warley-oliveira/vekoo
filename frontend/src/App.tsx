import { Navigate, Route, Routes } from "react-router"

import { AppShell } from "@/components/app-shell"
import { RedirectIfAuthenticated, RequireAuth } from "@/components/auth-guard"
import { BrandsPage, TemplatesPage } from "@/routes/coming-soon"
import { EditorPage } from "@/routes/editor"
import { ForgotPasswordPage } from "@/routes/forgot-password"
import { LoginPage } from "@/routes/login"
import { MyCarouselsPage } from "@/routes/my-carousels"
import { ResetPasswordPage } from "@/routes/reset-password"
import { SignUpPage } from "@/routes/signup"
import { TrashPage } from "@/routes/trash"

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
        {/* Editor em tela cheia — fora do AppShell de propósito */}
        <Route path="/carousels/:carouselId/edit" element={<EditorPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<MyCarouselsPage />} />
          <Route path="/folders/:folderId" element={<MyCarouselsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/trash" element={<TrashPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
