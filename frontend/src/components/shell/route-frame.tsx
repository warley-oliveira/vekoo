import { Suspense, type ReactNode } from "react"

import { RequirePermission } from "@/components/require-permission"
import { RouteBoundary } from "@/components/shell/route-boundary"
import { RouteSkeleton } from "@/components/shell/route-skeleton"
import { useRouteTitle } from "@/hooks/use-header-slot"
import type { PermissionKey } from "@/lib/auth"

// A moldura de cada rota da plataforma: permissão, limite de erro, esqueleto de
// carregamento e título na barra superior.
//
// Como uma rota nasce (`routes/<dominio>/index.tsx`): o arquivo é importado por
// `App.tsx` de forma estática e exporta um fragmento de `<Route>`, porque é só isso
// que `<Routes>` aceita como filho. Por isso ele fica pequeno, e a página entra por
// `lazy()`, que é o que abre o chunk do domínio:
//
//     const ContactsPage = lazy(() => import("./contacts-page"))
//
//     export const contactsRoutes = (
//       <Route
//         path="/contacts"
//         element={
//           <RouteFrame title="navigation.contacts" permission="contacts">
//             <ContactsPage />
//           </RouteFrame>
//         }
//       />
//     )

type RouteFrameProps = {
  /** Chave de tradução do título. A página pode refiná-lo com `usePageTitle`. */
  title: string
  /** Sem permissão: rota aberta a quem tem sessão. */
  permission?: PermissionKey
  children: ReactNode
}

export function RouteFrame({ title, permission, children }: RouteFrameProps) {
  const body = (
    <RouteBoundary>
      {/* `key` por título: uma fronteira nova mostra o esqueleto mesmo dentro da
          transição da navegação. Sem ela, o React seguraria a tela anterior até o
          chunk chegar e o clique no menu pareceria sem efeito. */}
      <Suspense key={title} fallback={<RouteSkeleton />}>
        {children}
      </Suspense>
    </RouteBoundary>
  )

  return (
    <>
      <RouteTitle titleKey={title} />
      {permission ? (
        <RequirePermission permission={permission}>{body}</RequirePermission>
      ) : (
        body
      )}
    </>
  )
}

function RouteTitle({ titleKey }: { titleKey: string }) {
  useRouteTitle(titleKey)
  return null
}
