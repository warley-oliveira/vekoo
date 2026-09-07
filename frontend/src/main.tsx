import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { SWRConfig } from 'swr'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/lib/i18n'
import { AuthProvider } from '@/lib/auth'
import { CatalogProvider } from '@/lib/catalog'
import { swrConfig } from '@/lib/swr-config'
import { dropLegacyStorage } from '@/lib/token'

dropLegacyStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SWRConfig value={swrConfig}>
        {/* Acima do auth: /catalog é público e as telas de entrada já o usam. */}
        <CatalogProvider>
          <AuthProvider>
            <TooltipProvider>
              <App />
              <Toaster position="bottom-right" />
            </TooltipProvider>
          </AuthProvider>
        </CatalogProvider>
      </SWRConfig>
    </BrowserRouter>
  </StrictMode>,
)
