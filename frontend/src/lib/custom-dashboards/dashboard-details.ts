import { z } from "zod"

// Nome, descrição e ícone de um painel: os mesmos ao criar e ao renomear.

export const MAX_DASHBOARD_NAME = 120
export const MAX_DASHBOARD_DESCRIPTION = 1000

export function dashboardDetailsSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t("customDashboards.validation.name")).max(MAX_DASHBOARD_NAME),
    description: z.string().trim().max(MAX_DASHBOARD_DESCRIPTION),
    icon: z.string(),
  })
}

export type DashboardDetailsValues = z.infer<ReturnType<typeof dashboardDetailsSchema>>
