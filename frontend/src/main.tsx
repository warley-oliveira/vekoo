import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { SWRConfig } from 'swr'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { PwaUpdatePrompt } from '@/components/shell/pwa-update-prompt'
import { TooltipProvider } from '@/components/ui/tooltip'
// Antes do roteador montar: quem ouve o voltar primeiro é quem decide. Ver o módulo.
import '@/lib/back-stack'
import { i18nReady } from '@/lib/i18n'
import { AuthProvider } from '@/lib/auth'
import { CatalogProvider } from '@/lib/catalog'
import { startPwa } from '@/lib/pwa'
import { swrConfig } from '@/lib/swr-config'
import { dropLegacyStorage } from '@/lib/token'

dropLegacyStorage()
startPwa()

// O texto da primeira tela já no idioma certo: em pt-BR não espera nada de rede.
await i18nReady

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SWRConfig value={swrConfig}>
        {/* Acima do auth: /catalog é público e as telas de entrada já o usam. */}
        <CatalogProvider>
          <AuthProvider>
            <TooltipProvider>
              <App />
              {/* Os avisos sobem junto com a barra inferior, em vez de cobri-la. */}
              <Toaster
                position="bottom-right"
                offset={{ bottom: 'calc(var(--app-bottom-nav-total) + 1rem)' }}
                mobileOffset={{
                  bottom: 'calc(var(--app-bottom-nav-total) + 0.75rem)',
                }}
              />
              <PwaUpdatePrompt />
            </TooltipProvider>
          </AuthProvider>
        </CatalogProvider>
      </SWRConfig>
    </BrowserRouter>
  </StrictMode>,
)
