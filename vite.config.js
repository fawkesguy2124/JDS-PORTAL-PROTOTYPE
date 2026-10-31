import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Long-lived vendor chunks: an app deploy no longer invalidates React,
// Supabase or the map/PDF/Excel libraries in the browser cache. Groups only
// name chunks; lazy libraries (maps, pdf.js, xlsx) stay lazy.
const VENDOR_GROUPS = [
  { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)[\\/]/, priority: 40 },
  { name: 'vendor-supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 30 },
  { name: 'vendor-maps', test: /node_modules[\\/](leaflet|maplibre-gl|@maplibre)[\\/]/, priority: 30 },
  // not the worker's `?url` module (a one-line string): grouped here it made every
  // page that knows the worker URL load all of pdf.js up front
  { name: 'vendor-pdf', test: /node_modules[\\/]pdfjs-dist[\\/](?!.*\?url)/, priority: 30 },
  { name: 'vendor-xlsx', test: /node_modules[\\/]xlsx[\\/]/, priority: 30 },
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: { groups: VENDOR_GROUPS },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://jds-portal-prototype.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
