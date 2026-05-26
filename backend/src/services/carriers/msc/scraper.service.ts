import * as cheerio from 'cheerio'
import { scrapeWithPlaywright } from '../../../utils/browserManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

export async function scrapeMscCheerio(containerNo: string): Promise<UnifiedTrackingData | null> {
  return null
}

export async function scrapeMscPlaywright(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const pageContent = await scrapeWithPlaywright(
      `https://www.msc.com/tracker?containerNo=${cn}`,
      { waitForMs: 5000 }
    )
    if (!pageContent) return null
    const $ = cheerio.load(pageContent)
    const events: TrackingEvent[] = []
    $('[class*="event"], [class*="milestone"], .timeline-item, [class*="tracking"] td').each((_, el) => {
      const description = $(el).find('[class*="title"], [class*="desc"]').first().text().trim() || $(el).text().trim()
      const location = $(el).find('[class*="location"]').first().text().trim()
      const dateStr = $(el).find('[class*="date"]').first().text().trim()
      if (description && description.length > 3) {
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
    const vessel = $('[class*="vessel"]').first().text().trim()
    return buildUnifiedResponse({
      containerNumber: cn,
      carrier: 'MSC',
      currentLocation: last.location || '',
      vessel,
      lastUpdate: last.timestamp,
      events,
    })
  } catch { return null }
}
