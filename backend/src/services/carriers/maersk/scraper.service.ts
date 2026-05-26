import * as cheerio from 'cheerio'
import { http } from '../../../utils/requestManager.js'
import { scrapeWithPlaywright } from '../../../utils/browserManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'
import { delay } from '../../../utils/delay.js'

export async function scrapeMaerskCheerio(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const { data: html } = await http.get(`https://www.maersk.com/tracking/${cn}`, {
      headers: { Accept: 'text/html' },
    })
    const $ = cheerio.load(html)

    const events: TrackingEvent[] = []
    $('[class*="event"], [class*="milestone"], [class*="timeline"] li, [data-testid*="event"]').each((_, el) => {
      const description = $(el).find('[class*="title"], [class*="desc"], [class*="label"]').first().text().trim() || $(el).text().trim()
      const location = $(el).find('[class*="location"], [class*="port"]').first().text().trim()
      const dateStr = $(el).find('[class*="date"], [class*="time"]').first().text().trim()
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
    const vessel = $('[class*="vessel"], [data-testid*="vessel"]').first().text().trim()

    return buildUnifiedResponse({
      containerNumber: cn,
      carrier: 'Maersk',
      currentLocation: last.location || '',
      vessel,
      lastUpdate: last.timestamp,
      events,
    })
  } catch {
    return null
  }
}

export async function scrapeMaerskPlaywright(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const result = await scrapeWithPlaywright(`https://www.maersk.com/tracking/${cn}`, {
      waitForSelector: '[class*="event"], [class*="milestone"]',
      waitForMs: 3000,
    })
    if (!result) return null

    const $ = cheerio.load(result)
    const events: TrackingEvent[] = []
    const vessel = $('[class*="vessel-name"], [class*="vesselName"]').first().text().trim()

    $('[class*="event-item"], [class*="EventItem"], [data-testid*="event"]').each((_, el) => {
      const description = $(el).find('[class*="title"], [class*="description"]').first().text().trim()
      const location = $(el).find('[class*="location"]').first().text().trim()
      const dateStr = $(el).find('[class*="date"], [class*="time"]').first().text().trim()
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
      carrier: 'Maersk',
      currentLocation: last.location || '',
      vessel,
      lastUpdate: last.timestamp,
      events,
    })
  } catch {
    return null
  }
}
