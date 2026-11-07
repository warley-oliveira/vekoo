import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

const ToolsPage = lazy(() => import("./tools-page"))
const FunctionsPage = lazy(() => import("./functions-page"))
const FunctionEditorPage = lazy(() => import("./function-editor-page"))

// Entra pelo `index.tsx` de fluxos: as ferramentas são de quem tem a permissão `flows`, e o menu de Fluxos já marca este
// endereço. O editor é uma rota só, com `new` no lugar do id: criar a função troca o endereço sem desmontar o que está na tela.
export const toolsRoutes = (
  <>
    <Route
      path="/tools"
      element={
        <RouteFrame title="navigation.routes.tools" permission="flows">
          <ToolsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/tools/functions"
      element={
        <RouteFrame title="navigation.routes.tools" permission="flows">
          <FunctionsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/tools/functions/:functionId"
      element={
        <RouteFrame title="tools.editor.routeTitle" permission="flows">
          <FunctionEditorPage />
        </RouteFrame>
      }
    />
  </>
)
