import { QueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => {
        // Never retry client errors (4xx); retry network/5xx twice.
        if (isAxiosError(err) && err.response && err.response.status < 500) return false
        return count < 2
      },
    },
    mutations: { retry: false },
  },
})
