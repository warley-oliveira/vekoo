import { lazy } from "react"
import { Route } from "react-router"

import { RouteFrame } from "@/components/shell/route-frame"
import { placeholderRoute } from "@/routes/placeholder"

const CampaignsPage = lazy(() => import("./campaigns-page"))
const CampaignMonitorPage = lazy(() => import("./campaign-monitor-page"))
const PlaceExtractionsPage = lazy(() => import("./place-extractions-page"))

export const campaignsRoutes = (
  <>
    <Route
      path="/campaigns"
      element={
        <RouteFrame title="navigation.campaigns" permission="campaigns">
          <CampaignsPage />
        </RouteFrame>
      }
    />
    {/* Criar e editar são do assistente (`wizard.tsx`), ligado na integração. */}
    <Route
      path="/campaigns/new"
      element={placeholderRoute("navigation.routes.campaignNew", "campaigns")}
    />
    <Route
      path="/campaigns/:campaignId/edit"
      element={placeholderRoute("navigation.routes.campaign", "campaigns")}
    />
    <Route
      path="/campaigns/:campaignId"
      element={
        <RouteFrame title="navigation.routes.campaign" permission="campaigns">
          <CampaignMonitorPage />
        </RouteFrame>
      }
    />
    <Route
      path="/place-extractions"
      element={
        <RouteFrame title="campaigns.places.title" permission="campaigns">
          <PlaceExtractionsPage />
        </RouteFrame>
      }
    />
  </>
)
