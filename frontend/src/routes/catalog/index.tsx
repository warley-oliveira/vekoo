import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"

const CatalogPage = lazy(() => import("./catalog-page"))
const CategoriesPage = lazy(() => import("./categories-page"))
const FieldsPage = lazy(() => import("./fields-page"))
const ItemPage = lazy(() => import("./item-page"))

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
      element={
        <RouteFrame title="navigation.routes.catalogCategories" permission="catalog">
          <CategoriesPage />
        </RouteFrame>
      }
    />
    <Route
      path="/catalog/fields"
      element={
        <RouteFrame title="navigation.routes.catalogFields" permission="catalog">
          <FieldsPage />
        </RouteFrame>
      }
    />
    <Route
      path="/catalog/:itemId"
      element={
        <RouteFrame title="navigation.routes.catalogItem" permission="catalog">
          <ItemPage />
        </RouteFrame>
      }
    />
  </>
)
