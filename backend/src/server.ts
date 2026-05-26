import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import trackingRoutes from './routes/tracking.routes.js'

const app = express()

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/tracking', trackingRoutes)

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(config.port, () => {
  console.log(`JDS Tracking API running on http://localhost:${config.port}`)
  console.log(`Health check: http://localhost:${config.port}/api/health`)
  console.log(`On-demand tracking only — no background scraping or cron jobs`)
})

export default app
