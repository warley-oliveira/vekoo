import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"
import { placeholderRoute } from "@/routes/placeholder"

const CatalogPage = lazy(() => import("./catalog-page"))

export const catalogRoutes = (
  <>
    <Route
      path="/catalog"
      element={
        <RouteFrame title="navigation.catalog" permission="catalog">
          <CatalogPage />
        </RouteFrame>
      }
    />
    <Route
      path="/catalog/categories"
      element={placeholderRoute("navigation.routes.catalogCategories", "catalog")}
    />
    <Route
      path="/catalog/fields"
      element={placeholderRoute("navigation.routes.catalogFields", "catalog")}
    />
    <Route
      path="/catalog/:itemId"
      element={placeholderRoute("navigation.routes.catalogItem", "catalog")}
    />
  </>
)
