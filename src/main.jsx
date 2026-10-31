import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// global CSS, in cascade order (see src/index.css)
import './index.css'
import './ui/tokens.css'
import './ui/components.css'
import './tailwind-utilities.css'
import App from './App.jsx'
import { ToastProvider } from './ui/Toast'
import { startAppWorker } from './services/desktopApp.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)

// the portal as an installable desktop app (manifest + public/sw.js)
startAppWorker()
