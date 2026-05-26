import * as cheerio from 'cheerio'
import { http } from '../../../utils/requestManager.js'
import { scrapeWithPlaywright } from '../../../utils/browserManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

export async function scrapeOoclCheerio(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const { data: html } = await http.get(`https://www.oocl.com/shipmenttracking/Container/${cn}`)
    const $ = cheerio.load(html)
    const events: TrackingEvent[] = []
    $('table tr, .event-row, [class*="milestone"]').each((_, el) => {
      const tds = $(el).find('td')
      if (tds.length >= 2) {
        events.push({
          status: 'in_transit',
          location: $(tds[1]).text().trim(),
          timestamp: tds.length >= 3 ? $(tds[2]).text().trim() : '',
          description: $(tds[0]).text().trim(),
          source: 'carrier',
        })
      }
    })
    if (events.length === 0) return null
    const last = events[events.length - 1]
    return buildUnifiedResponse({
      containerNumber: cn,
      carrier: 'OOCL',
      currentLocation: last.location || '',
      lastUpdate: last.timestamp,
      events,
    })
  } catch { return null }
}

export async function scrapeOoclPlaywright(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const pageContent = await scrapeWithPlaywright(
      `https://www.oocl.com/shipmenttracking/Container/${cn}`,
      { waitForMs: 5000 }
    )
    if (!pageContent) return null
    const $ = cheerio.load(pageContent)
    const events: TrackingEvent[] = []
    $('[class*="event"], [class*="milestone"], table tr, .timeline-item').each((_, el) => {
      const description = $(el).find('[class*="title"], [class*="description"]').first().text().trim() || $(el).text().trim()
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
      carrier: 'OOCL',
      currentLocation: last.location || '',
      lastUpdate: last.timestamp,
      events,
    })
  } catch { return null }
}
