import { lazy } from "react"

export const SettingsPage = lazy(() => import("./settings-page"))
export const TriggersPage = lazy(() => import("./triggers-page"))
export const GoalsPage = lazy(() => import("./goals-page"))
export const FieldsPage = lazy(() => import("./fields-page"))
export const LabelsPage = lazy(() => import("./labels-page"))
export const MetricsPage = lazy(() => import("./metrics-page"))
export const ArchivedPage = lazy(() => import("./archived-page"))
