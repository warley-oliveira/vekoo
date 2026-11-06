import { Route } from "react-router"

import { placeholderRoute } from "@/routes/placeholder"

export const campaignsRoutes = (
  <>
    <Route
      path="/campaigns"
      element={placeholderRoute("navigation.campaigns", "campaigns")}
    />
    <Route
      path="/campaigns/new"
      element={placeholderRoute("navigation.routes.campaignNew", "campaigns")}
    />
    <Route
      path="/campaigns/:campaignId"
      element={placeholderRoute("navigation.routes.campaign", "campaigns")}
    />
  </>
)
