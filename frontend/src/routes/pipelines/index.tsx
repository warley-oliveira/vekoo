import { lazy } from "react"
import { Route } from "@/lib/router"

import { RouteFrame } from "@/components/shell/route-frame"

const PipelinesPage = lazy(() => import("./pipelines-page"))

// Filhos sem tela (`element={null}`, para o roteador saber que é de propósito): existem
// só para `/pipelines/:boardId/:view` ser uma rota válida. A página é a do pai, então
// trocar de visão não a remonta, e `useParams()` nela enxerga `boardId` e `view`.
//
// Os endereços estáticos do pipeline (`settings/*`, `metrics`, `archived`) vencem `:view`.
export const pipelinesRoutes = (
  <Route
    path="/pipelines"
    element={
      <RouteFrame title="navigation.pipelines" permission="pipelines">
        <PipelinesPage />
      </RouteFrame>
    }
  >
    <Route path=":boardId" element={null}>
      <Route path=":view" element={null} />
    </Route>
  </Route>
)
