import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

// O grupo CRIAÇÃO do menu: o Vekoo de carrosséis. O editor fica de fora daqui porque
// é tela cheia, sem a casca (ver `App.tsx`).

const MyCarouselsPage = lazy(() =>
  import("@/routes/my-carousels").then((m) => ({ default: m.MyCarouselsPage }))
)
const TemplatesPage = lazy(() =>
  import("@/routes/coming-soon").then((m) => ({ default: m.TemplatesPage }))
)
const BrandsPage = lazy(() =>
  import("@/routes/coming-soon").then((m) => ({ default: m.BrandsPage }))
)
const TrashPage = lazy(() =>
  import("@/routes/trash").then((m) => ({ default: m.TrashPage }))
)

// Os dois caminhos têm o mesmo título de rota de propósito: é o que mantém uma só
// instância da página ao abrir uma pasta (aba e ordenação continuam como estavam).
// O nome da pasta entra pela própria página, com `usePageTitle`.
export const carouselsRoutes = (
  <>
    <Route
      path="/carousels"
      element={
        <RouteFrame title="navigation.carousels">
          <MyCarouselsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/folders/:folderId"
      element={
        <RouteFrame title="navigation.carousels">
          <MyCarouselsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/templates"
      element={
        <RouteFrame title="navigation.templates">
          <TemplatesPage />
        </RouteFrame>
      }
    />
    <Route
      path="/brands"
      element={
        <RouteFrame title="navigation.brands">
          <BrandsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/trash"
      element={
        <RouteFrame title="navigation.trash">
          <TrashPage />
        </RouteFrame>
      }
    />
  </>
)
