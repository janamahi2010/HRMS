import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  // Guard against the easiest deploy mistake: building for Render without the API address.
  // The site would then call /api on its own static domain and every login would fail with
  // "Unable to reach the server". Fail the build with a clear message instead.
  if (command === 'build') {
    const apiUrl = process.env.VITE_API_URL ?? loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL
    const onRender = !!process.env.RENDER
    if (!apiUrl || (onRender && !/^https?:\/\//.test(apiUrl))) {
      throw new Error(
        `VITE_API_URL is ${apiUrl ? `"${apiUrl}" (relative)` : 'not set'}. ` +
          'Set it to the full API address, e.g. https://hrms-api.onrender.com/api, in the hrms-web service environment.',
      )
    }
  }
  return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    host: true, // listen on IPv4 + IPv6 so localhost, 127.0.0.1 and LAN addresses all work
    // Dev only: the browser calls /api on this same origin and Vite forwards it to Django,
    // so there's no CORS no matter which address the app is opened from.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Stable vendor chunks for the always-needed core (long-term caching across deploys).
        // Everything else (Radix pieces, Leaflet, SheetJS) is split automatically so it only
        // loads on the routes that use it.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return 'react'
          if (/[\\/]node_modules[\\/](@tanstack|axios)[\\/]/.test(id)) return 'data'
          return undefined
        },
      },
    },
  },
  }
})
