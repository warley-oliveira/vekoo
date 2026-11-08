import { lazy, type ComponentType } from "react"
import { Route } from "@/lib/router"

import { RouteFrame } from "@/components/shell/route-frame"

// Páginas internas, só em desenvolvimento: todo arquivo `routes/dev/<nome>.tsx` com
// export default vira `/dev/<nome>`, sem registro manual. O ternário sai inteiro do
// build de produção, junto com os `import()` que o glob gera.

const pages = import.meta.env.DEV
  ? import.meta.glob<{ default: ComponentType }>("./dev/*.tsx")
  : {}

export const devRoutes = Object.entries(pages).map(([file, load]) => {
  const name = file.replace(/^\.\/dev\/|\.tsx$/g, "")
  const Page = lazy(load)
  return (
    <Route
      key={name}
      path={`/dev/${name}`}
      element={
        <RouteFrame title="navigation.routes.dev">
          <Page />
        </RouteFrame>
      }
    />
  )
})
