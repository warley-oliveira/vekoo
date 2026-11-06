import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

// Filhos sem `element`: existem só para `/pipelines/:boardId/:view` ser uma rota
// válida. A página é a do pai, então trocar de quadro ou de visão não a remonta, e
// `useParams()` nela enxerga `boardId` e `view`.
export const pipelinesRoutes = (
  <Route
    path="/pipelines"
    element={placeholderRoute("navigation.pipelines", "pipelines")}
  >
    <Route path=":boardId">
      <Route path=":view" />
    </Route>
  </Route>
)
