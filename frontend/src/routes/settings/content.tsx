import { lazy } from "react"
import { Route } from "@/lib/router"

import { RouteFrame } from "@/components/shell/route-frame"

const QuickRepliesPage = lazy(() => import("./content/quick-replies-page"))
const AttachmentsPage = lazy(() => import("./content/attachments-page"))
const CustomFieldsPage = lazy(() => import("./content/custom-fields-page"))

// O caminho é relativo a `/settings`.
export const settingsContentRoutes = (
  <>
    <Route
      path="quick-replies"
      element={
        <RouteFrame title="navigation.quickReplies" permission="core_settings">
          <QuickRepliesPage />
        </RouteFrame>
      }
    />
    <Route
      path="attachments"
      element={
        <RouteFrame title="navigation.attachments" permission="core_settings">
          <AttachmentsPage />
        </RouteFrame>
      }
    />
    <Route
      path="custom-fields"
      element={
        <RouteFrame title="navigation.customFields" permission="core_settings">
          <CustomFieldsPage />
        </RouteFrame>
      }
    />
  </>
)
