import { lazy } from "react"
import { Route } from "@/lib/router"

import { RouteFrame } from "@/components/shell/route-frame"

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
    {/* Criar e editar são do assistente: ver `wizard.tsx`. */}
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
