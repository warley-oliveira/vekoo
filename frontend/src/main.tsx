import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/lib/i18n'
import { AuthProvider } from '@/lib/auth'
import { StoreProvider } from '@/lib/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <TooltipProvider>
            <App />
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
