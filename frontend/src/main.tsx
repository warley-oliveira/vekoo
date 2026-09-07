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
import { StoreProvider } from '@/lib/store'
import { swrConfig } from '@/lib/swr-config'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SWRConfig value={swrConfig}>
        <AuthProvider>
          <StoreProvider>
            <TooltipProvider>
              <App />
              <Toaster position="bottom-right" />
            </TooltipProvider>
          </StoreProvider>
        </AuthProvider>
      </SWRConfig>
    </BrowserRouter>
  </StrictMode>,
)
