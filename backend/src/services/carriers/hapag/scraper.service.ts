import * as cheerio from 'cheerio'
import { http } from '../../../utils/requestManager.js'
import { scrapeWithPlaywright } from '../../../utils/browserManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

export async function scrapeHapagCheerio(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const { data: html } = await http.get(`https://www.hapag-lloyd.com/tracking.html`, {
      headers: { Accept: 'text/html' },
    })
    return null
  } catch { return null }
}

export async function scrapeHapagPlaywright(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const pageContent = await scrapeWithPlaywright(
      `https://www.hapag-lloyd.com/tracking/${cn}`,
      { waitForMs: 5000 }
    )
    if (!pageContent) return null
    const $ = cheerio.load(pageContent)

    const events: TrackingEvent[] = []
    $('[class*="milestone"], [class*="timeline"] li, [class*="event"]').each((_, el) => {
      const description = $(el).find('[class*="title"], [class*="desc"]').first().text().trim() || $(el).text().trim()
      const location = $(el).find('[class*="location"]').first().text().trim()
      const dateStr = $(el).find('[class*="date"]').first().text().trim()
      if (description) {
        events.push({
          status: 'in_transit',
          location,
          timestamp: dateStr,
          description: description.slice(0, 200),
          source: 'carrier',
        })
      }
    })

    if (events.length === 0) return null
    const last = events[events.length - 1]
    return buildUnifiedResponse({
      containerNumber: cn,
      carrier: 'Hapag-Lloyd',
      currentLocation: last.location || '',
      lastUpdate: last.timestamp,
      events,
    })
  } catch { return null }
}
