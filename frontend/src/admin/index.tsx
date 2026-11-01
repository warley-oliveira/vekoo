import "@/admin/i18n"

import { useTranslation } from "react-i18next"
import { Link, Navigate, NavLink, Outlet, Route, Routes } from "react-router"
import { ArrowLeft } from "lucide-react"

import { InstagramTokenBanner } from "@/admin/components/instagram-token-banner"
import { EvalPairPage, EvalRoundEntry } from "@/admin/eval-pair"
import { EvalResultsPage } from "@/admin/eval-results"
import { EvalRoundsPage } from "@/admin/evals"
import { ReferenceImportPage } from "@/admin/reference-import"
import { ReferenceImportsPage } from "@/admin/reference-imports"
import { ReferenceListPage } from "@/admin/reference-list"
import { ReferenceNewPage } from "@/admin/reference-new"
import { ReferenceReviewPage } from "@/admin/reference-review"
import { VekooMark } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// A área da Vekoo: a curadoria do banco de referências. Carrega sob demanda
// (`App.tsx`), só para conta staff — o assinante não baixa nada daqui, nem os
// textos. A API confere o staff de novo em cada rota.
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="references" replace />} />
        <Route path="references" element={<ReferenceListPage />} />
        <Route path="references/new" element={<ReferenceNewPage />} />
        <Route path="references/:referenceId" element={<ReferenceReviewPage />} />
        <Route path="imports" element={<ReferenceImportsPage />} />
        <Route path="imports/:importId" element={<ReferenceImportPage />} />
        <Route path="evals" element={<EvalRoundsPage />} />
        <Route path="evals/:round" element={<EvalRoundEntry />} />
        <Route path="evals/:round/pairs/:pairId" element={<EvalPairPage />} />
        <Route path="evals/:round/results" element={<EvalResultsPage />} />
        <Route path="*" element={<Navigate to="references" replace />} />
      </Route>
    </Routes>
  )
}

function AdminLayout() {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <VekooMark />
          <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{t("admin.title")}</span>
          <nav aria-label={t("admin.nav.label")} className="flex items-center gap-1">
            {(
              [
                ["/admin/references", "admin.nav.references"],
                ["/admin/imports", "admin.nav.imports"],
                ["/admin/evals", "admin.nav.evals"],
              ] as const
            ).map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                    isActive ? "font-medium text-foreground" : "text-muted-foreground"
                  )
                }
              >
                {t(label)}
              </NavLink>
            ))}
          </nav>
          <Button variant="ghost" size="sm" className="ml-auto" render={<Link to="/" />}>
            <ArrowLeft aria-hidden />
            <span className="hidden sm:inline">{t("admin.nav.backToApp")}</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:py-8">
        {/* Token vencendo ou vencido: em toda a curadoria. */}
        <InstagramTokenBanner />
        <Outlet />
      </main>
    </div>
  )
}
