const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')

// Load KEY=value lines from .env next to this file (no extra package needed)
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

// Shared secret: only requests carrying this key (sent by the Supabase Edge
// Functions) are forwarded to ULIP. Set it in ~/ulip-proxy/.env as PROXY_KEY.
const PROXY_KEY = process.env.PROXY_KEY || ''
// PROXY_ENFORCE=true blocks requests without the key. Leave it off during
// rollout so the portal keeps working until the functions send the key.
const ENFORCE = process.env.PROXY_ENFORCE === 'true'

function keyMatches(given) {
  if (!PROXY_KEY || typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(PROXY_KEY)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const app = express()

app.use((req, res, next) => {
  if (keyMatches(req.headers['x-proxy-key'])) return next()
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  if (!ENFORCE) {
    console.warn(`[${new Date().toISOString()}] NO KEY (allowed, enforce off) ${req.method} ${req.url} from ${ip}`)
    return next()
  }
  console.warn(`[${new Date().toISOString()}] BLOCKED ${req.method} ${req.url} from ${ip}`)
  res.status(403).json({ error: 'Forbidden' })
})

app.use('/', createProxyMiddleware({
  target: 'https://www.ulip.dpiit.gov.in',
  changeOrigin: true,
  secure: false,
  headers: {
    'Host': 'www.ulip.dpiit.gov.in'
  },
  on: {
    proxyReq: (proxyReq, req) => {
      // Never forward our key to ULIP
      proxyReq.removeHeader('x-proxy-key')
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
    },
    error: (err, req, res) => {
      console.error('Proxy error:', err.message)
      res.status(502).json({ error: 'Proxy error', detail: err.message })
    }
  }
}))

app.listen(3000, () => {
  console.log(`ULIP proxy running on port 3000 (key ${PROXY_KEY ? 'set' : 'NOT SET'}, enforce ${ENFORCE ? 'on' : 'off'})`)
})
