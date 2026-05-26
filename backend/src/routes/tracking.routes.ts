import { Router, Request, Response } from 'express'
import { getTracking } from '../services/aggregator/trackingAggregator.service.js'
import { getAllTracking, upsertTracking, deleteTracking, linkContainerToJob, deactivateTracking } from '../db/tracking.db.js'
import { normalizeContainerNo } from '../utils/normalizer.js'

const router = Router()

// GET /api/tracking — list all tracked containers from DB
router.get('/', async (_req: Request, res: Response) => {
  try {
    const records = await getAllTracking()
    res.json(records)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch tracking records' })
  }
})

// GET /api/tracking/:containerNo — live fetch + DB lookup for a single container
router.get('/:containerNo', async (req: Request, res: Response) => {
  try {
    const cn = normalizeContainerNo(req.params.containerNo as string)
    const forceRefresh = req.query.refresh === 'true'
    const result = await getTracking(cn, { forceRefresh })
    res.json(result.data)
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'No tracking data found' })
  }
})

// POST /api/tracking/link — link a container to a job
router.post('/link', async (req: Request, res: Response) => {
  try {
    const { containerNo, jobId, jobNumber, carrier } = req.body
    if (!containerNo || !jobId) {
      res.status(400).json({ error: 'containerNo and jobId are required' })
      return
    }
    const cn = normalizeContainerNo(containerNo)
    await linkContainerToJob(cn, jobId, jobNumber || '', carrier)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to link container' })
  }
})

// POST /api/tracking/check/:containerNo — on-demand live tracking check
router.post('/check/:containerNo', async (req: Request, res: Response) => {
  try {
    const cn = normalizeContainerNo(req.params.containerNo as string)
    const carrier = req.body?.carrier || req.query?.carrier as string | undefined
    const result = await getTracking(cn, { forceRefresh: true, carrierHint: carrier })
    res.json(result.data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Tracking check failed' })
  }
})

// PUT /api/tracking/:containerNo — manual update
router.put('/:containerNo', async (req: Request, res: Response) => {
  try {
    const cn = normalizeContainerNo(req.params.containerNo as string)
    const updates = req.body
    const record: any = {
      containerNumber: cn,
      carrier: updates.carrier || 'Unknown',
      currentStatus: updates.currentStatus || 'unknown',
      currentLocation: updates.currentLocation || '',
      vessel: updates.vessel || '',
      voyage: updates.voyage || '',
      eta: updates.eta || null,
      vesselArrival: updates.vesselArrival || null,
      portIn: updates.portIn || null,
      portOut: updates.portOut || null,
      cfsGateIn: updates.cfsGateIn || null,
      lastUpdate: new Date().toISOString(),
      events: updates.events || [],
    }
    const result = await upsertTracking(record)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Update failed' })
  }
})

// DELETE /api/tracking/:containerNo
router.delete('/:containerNo', async (req: Request, res: Response) => {
  try {
    const cn = normalizeContainerNo(req.params.containerNo as string)
    await deleteTracking(cn)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Delete failed' })
  }
})

// POST /api/tracking/:containerNo/deactivate
router.post('/:containerNo/deactivate', async (req: Request, res: Response) => {
  try {
    const cn = normalizeContainerNo(req.params.containerNo as string)
    await deactivateTracking(cn)
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Deactivate failed' })
  }
})

export default router
