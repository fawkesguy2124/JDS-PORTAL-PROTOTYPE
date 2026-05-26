import * as cheerio from 'cheerio'
import { http } from '../../../utils/requestManager.js'
import { scrapeWithPlaywright } from '../../../utils/browserManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

export async function scrapeCMACheerio(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const { data: html } = await http.get(`https://www.cma-cgm.com/ebusiness/tracking/${cn}`)
    const $ = cheerio.load(html)
    const events: TrackingEvent[] = []
    $('.tracking-event, .event-row, [class*="milestone"], .timeline-item').each((_, el) => {
      const description = $(el).find('.event-label, .description, .title').text().trim()
      const location = $(el).find('.event-location, .location, .port').text().trim()
      const dateStr = $(el).find('.event-date, .date, .time').text().trim()
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
    const vessel = $('[class*="vessel"]').first().text().trim()
    return buildUnifiedResponse({
      containerNumber: cn,
      carrier: 'CMA-CGM',
      currentLocation: last.location || '',
      vessel,
      lastUpdate: last.timestamp,
      events,
    })
  } catch { return null }
}

export async function scrapeCMAPlaywright(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const pageContent = await scrapeWithPlaywright(
      `https://www.cma-cgm.com/ebusiness/tracking/${cn}`,
      { waitForMs: 5000 }
    )
    if (!pageContent) return null
    const $ = cheerio.load(pageContent)
    const events: TrackingEvent[] = []
    $('[class*="event"], [class*="milestone"], .timeline-item').each((_, el) => {
      const description = $(el).find('[class*="title"], [class*="description"]').first().text().trim()
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
      carrier: 'CMA-CGM',
      currentLocation: last.location || '',
      lastUpdate: last.timestamp,
      events,
    })
  } catch { return null }
}
