import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const catalogRoutes = (
  <>
    <Route
      path="/catalog"
      element={placeholderRoute("navigation.catalog", "catalog")}
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
