import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

// Filho sem `element`: existe só para `/chat/:chatId` ser uma rota válida. O router
// reaproveita o elemento do pai, então entrar na conversa, sair dela ou trocar de
// conversa NÃO remonta a página: a lista, as mensagens e as assinaturas do cable
// seguem com uma instância só. `useParams()` na página enxerga `chatId`.
export const chatRoutes = (
  <Route path="/chat" element={placeholderRoute("navigation.chat", "chat")}>
    <Route path=":chatId" />
  </Route>
)
