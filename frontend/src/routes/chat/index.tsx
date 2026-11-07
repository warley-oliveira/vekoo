import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

const ChatPage = lazy(() => import("./chat-page"))

// Filho sem tela (`element={null}`, para o roteador saber que é de propósito): existe só
// para `/chat/:chatId` ser uma rota válida. A página é a do pai, então entrar na conversa,
// sair dela ou trocar de conversa NÃO a remonta: a lista, as mensagens e as assinaturas do
// cable seguem com uma instância só. `useParams()` na página enxerga `chatId`.
export const chatRoutes = (
  <Route
    path="/chat"
    element={
      <RouteFrame title="navigation.chat" permission="chat">
        <ChatPage />
      </RouteFrame>
    }
  >
    <Route path=":chatId" element={null} />
  </Route>
)
