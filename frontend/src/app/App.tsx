import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { ThemeProvider, useTheme } from '@/hooks/useTheme'
import { queryClient } from '@/lib/queryClient'
import { router } from './router'

function ThemedToaster() {
  const { resolved } = useTheme()
  const isMobile = useIsMobile()
  return (
    <Toaster
      theme={resolved}
      position={isMobile ? 'top-center' : 'bottom-right'}
      richColors
      closeButton
      duration={3500}
      toastOptions={{ className: 'font-sans' }}
    />
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <RouterProvider router={router} />
            <ThemedToaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
