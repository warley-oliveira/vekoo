import { Route } from "@/lib/router"

import { RouteFrame } from "@/components/shell/route-frame"
import { CampaignWizardPage } from "./wizard/lazy"

// O mesmo elemento nas duas rotas, com o mesmo título: criar o rascunho troca `new` por `edit` na URL, e o
// formulário aberto precisa continuar o mesmo. Um título por rota remontaria a página no meio da digitação.
const wizard = (
  <RouteFrame title="navigation.routes.campaignNew" permission="campaigns">
    <CampaignWizardPage />
  </RouteFrame>
)

export const campaignWizardRoutes = (
  <>
    <Route path="/campaigns/new" element={wizard} />
    <Route path="/campaigns/:campaignId/edit" element={wizard} />
  </>
)
