import { lazy } from "react"
import { Navigate, Route, useParams } from "@/lib/router"

import { RouteFrame } from "@/components/shell/route-frame"
import { BrandGate } from "@/routes/brand-gate"
import { BrandLayout } from "@/routes/brand-layout"

// O grupo CRIAÇÃO do menu, dentro da casca. A marca é o contexto raiz: tudo mora sob
// `/brands/:brandId` (`BrandLayout` valida a marca e dá `useActiveBrand`). O editor de carrossel
// e o onboarding ficam de fora daqui porque são tela cheia, sem a casca (ver `App.tsx`).
//
// Os caminhos de antes da marca (`/carousels`, `/folders/:id`, `/trash`, `/templates`) seguem
// valendo: `BrandGate` leva à mesma tela na marca ativa.

const BrandDashboardPage = lazy(() =>
  import("@/routes/brand-home").then((m) => ({ default: m.BrandDashboardPage }))
)
const MyCarouselsPage = lazy(() =>
  import("@/routes/my-carousels").then((m) => ({ default: m.MyCarouselsPage }))
)
const ContentsPage = lazy(() =>
  import("@/routes/contents").then((m) => ({ default: m.ContentsPage }))
)
const PiecePage = lazy(() => import("@/routes/piece").then((m) => ({ default: m.PiecePage })))
const CreatePage = lazy(() => import("@/routes/create").then((m) => ({ default: m.CreatePage })))
const BrandPage = lazy(() => import("@/routes/brand").then((m) => ({ default: m.BrandPage })))
const BrandSetupPage = lazy(() =>
  import("@/routes/brand-setup").then((m) => ({ default: m.BrandSetupPage }))
)
const TemplatesPage = lazy(() =>
  import("@/routes/coming-soon").then((m) => ({ default: m.TemplatesPage }))
)
const TrashPage = lazy(() => import("@/routes/trash").then((m) => ({ default: m.TrashPage })))
const OrphansPage = lazy(() =>
  import("@/routes/orphans").then((m) => ({ default: m.OrphansPage }))
)

/** `/folders/:folderId` de antes da marca: a mesma pasta, na marca ativa. */
function LegacyFolderRedirect() {
  const { folderId } = useParams()
  return <BrandGate sub={folderId ? `/folders/${folderId}` : "/carousels"} />
}

// Os dois caminhos de carrossel têm o mesmo título de rota de propósito: é o que mantém uma só
// instância da página ao abrir uma pasta (aba e ordenação continuam como estavam). O nome da
// pasta entra pela própria página, com `usePageTitle`. Idem para as duas rotas de "Criar".
export const carouselsRoutes = (
  <>
    <Route path="/brands" element={<BrandGate />} />
    <Route path="/carousels" element={<BrandGate sub="/carousels" />} />
    <Route path="/folders/:folderId" element={<LegacyFolderRedirect />} />
    <Route path="/trash" element={<BrandGate sub="/trash" />} />
    <Route path="/templates" element={<BrandGate sub="/templates" />} />

    <Route path="/brands/:brandId" element={<BrandLayout />}>
      <Route
        index
        element={
          <RouteFrame title="navigation.brandHome">
            <BrandDashboardPage />
          </RouteFrame>
        }
      />
      <Route
        path="carousels"
        element={
          <RouteFrame title="navigation.carousels">
            <MyCarouselsPage />
          </RouteFrame>
        }
      />
      <Route
        path="folders/:folderId"
        element={
          <RouteFrame title="navigation.carousels">
            <MyCarouselsPage />
          </RouteFrame>
        }
      />
      <Route
        path="contents"
        element={
          <RouteFrame title="navigation.contents">
            <ContentsPage />
          </RouteFrame>
        }
      />
      <Route
        path="contents/:pieceId"
        element={
          <RouteFrame title="navigation.piece">
            <PiecePage />
          </RouteFrame>
        }
      />
      {/* A criação por conversa é o caminho principal. */}
      <Route
        path="create"
        element={
          <RouteFrame title="navigation.create">
            <CreatePage />
          </RouteFrame>
        }
      />
      <Route
        path="create/:conversationId"
        element={
          <RouteFrame title="navigation.create">
            <CreatePage />
          </RouteFrame>
        }
      />
      {/* A geração de imagem virou ferramenta do agente, e o modo avançado (formulário por
          motor) saiu: o editor de peças é o modo manual. Link salvo cai em Criar. */}
      <Route path="images" element={<Navigate to="../create" relative="path" replace />} />
      <Route path="advanced" element={<Navigate to="../create" relative="path" replace />} />
      <Route
        path="advanced/:engineId"
        element={<Navigate to="../../create" relative="path" replace />}
      />
      <Route
        path="settings"
        element={
          <RouteFrame title="navigation.brand">
            <BrandPage />
          </RouteFrame>
        }
      />
      <Route
        path="setup"
        element={
          <RouteFrame title="navigation.brand">
            <BrandSetupPage />
          </RouteFrame>
        }
      />
      <Route
        path="setup/:step"
        element={
          <RouteFrame title="navigation.brand">
            <BrandSetupPage />
          </RouteFrame>
        }
      />
      <Route
        path="templates"
        element={
          <RouteFrame title="navigation.templates">
            <TemplatesPage />
          </RouteFrame>
        }
      />
      <Route
        path="trash"
        element={
          <RouteFrame title="navigation.trash">
            <TrashPage />
          </RouteFrame>
        }
      />
    </Route>

    {/* Migração do legado: carrosséis e pastas sem marca. Some quando os órfãos zeram. */}
    <Route
      path="/migration/orphans"
      element={
        <RouteFrame title="navigation.orphans">
          <OrphansPage />
        </RouteFrame>
      }
    />
  </>
)
