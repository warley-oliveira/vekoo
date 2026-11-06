import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

const ChatPage = lazy(() => import("./chat-page"))

// Filho sem `element`: existe só para `/chat/:chatId` ser uma rota válida. O router
// reaproveita o elemento do pai, então entrar na conversa, sair dela ou trocar de
// conversa NÃO remonta a página: a lista, as mensagens e as assinaturas do cable
// seguem com uma instância só. `useParams()` na página enxerga `chatId`.
export const chatRoutes = (
  <Route
    path="/chat"
    element={
      <RouteFrame title="navigation.chat" permission="chat">
        <ChatPage />
      </RouteFrame>
    }
  >
    <Route path=":chatId" />
  </Route>
)
