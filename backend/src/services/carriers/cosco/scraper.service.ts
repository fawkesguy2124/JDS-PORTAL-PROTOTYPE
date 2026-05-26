import * as cheerio from 'cheerio'
import { http } from '../../../utils/requestManager.js'
import { scrapeWithPlaywright } from '../../../utils/browserManager.js'
import { UnifiedTrackingData, TrackingEvent } from '../../../types/index.js'
import { buildUnifiedResponse, normalizeContainerNo } from '../../../utils/normalizer.js'

export async function scrapeCoscoCheerio(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const { data: html } = await http.get(`https://lines.coscoshipping.com/ebusiness/cargoTracking`)
    return null
  } catch { return null }
}

export async function scrapeCoscoPlaywright(containerNo: string): Promise<UnifiedTrackingData | null> {
  const cn = normalizeContainerNo(containerNo)
  try {
    const pageContent = await scrapeWithPlaywright(
      `https://lines.coscoshipping.com/ebusiness/cargoTracking?containerNo=${cn}`,
      { waitForMs: 5000, waitForSelector: '[class*="event"], [class*="table"]' }
    )
    if (!pageContent) return null
    const $ = cheerio.load(pageContent)
    const events: TrackingEvent[] = []
    $('[class*="event"], [class*="milestone"], table tr, .timeline-item').each((_, el) => {
      const tds = $(el).find('td')
      const description = $(el).find('[class*="title"], [class*="desc"]').first().text().trim() || $(tds[0]).text().trim()
      const location = $(el).find('[class*="location"]').first().text().trim() || ($(tds[1]) ? $(tds[1]).text().trim() : '')
      const dateStr = $(el).find('[class*="date"]').first().text().trim() || ($(tds[2]) ? $(tds[2]).text().trim() : '')
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
      carrier: 'COSCO',
      currentLocation: last.location || '',
      lastUpdate: last.timestamp,
      events,
    })
  } catch { return null }
}
