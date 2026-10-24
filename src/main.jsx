import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { startAppWorker } from './services/desktopApp.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// the portal as an installable desktop app (manifest + public/sw.js)
startAppWorker()
