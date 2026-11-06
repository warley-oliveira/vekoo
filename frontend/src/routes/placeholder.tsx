import { lazy } from "react"

import { RouteFrame } from "@/components/shell/route-frame"
import type { PermissionKey } from "@/lib/auth"

/**
 * O placeholder como uma página `lazy` de verdade: a fronteira de `Suspense` e o
 * limite de erro de cada rota já trabalham desde o primeiro dia.
 */
const PlaceholderPage = lazy(
  () => import("@/components/shell/placeholder-page")
)

/**
 * Elemento de uma rota ainda não migrada. Para pôr a tela no lugar, troque no
 * `index.tsx` do domínio (exemplo completo em `components/shell/route-frame.tsx`):
 *
 *     element={placeholderRoute("navigation.contacts", "contacts")}
 *
 * por
 *
 *     element={
 *       <RouteFrame title="navigation.contacts" permission="contacts">
 *         <ContactsPage />
 *       </RouteFrame>
 *     }
 */
export function placeholderRoute(title: string, permission?: PermissionKey) {
  return (
    <RouteFrame title={title} permission={permission}>
      <PlaceholderPage titleKey={title} />
    </RouteFrame>
  )
}
