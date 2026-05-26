import { UnifiedTrackingData, CarrierAdapter, ScrapeResult } from '../../types/index.js'
import { withRetry } from '../../utils/retry.js'

import { tryMaerskHiddenAPI } from './maersk/hiddenApi.service.js'
import { scrapeMaerskCheerio, scrapeMaerskPlaywright } from './maersk/scraper.service.js'
import { tryHapagHiddenAPI } from './hapag/hiddenApi.service.js'
import { scrapeHapagCheerio, scrapeHapagPlaywright } from './hapag/scraper.service.js'
import { tryCMAHiddenAPI } from './cma/hiddenApi.service.js'
import { scrapeCMACheerio, scrapeCMAPlaywright } from './cma/scraper.service.js'
import { tryMscHiddenAPI } from './msc/hiddenApi.service.js'
import { scrapeMscCheerio, scrapeMscPlaywright } from './msc/scraper.service.js'
import { tryOneHiddenAPI } from './one/hiddenApi.service.js'
import { scrapeOneCheerio, scrapeOnePlaywright } from './one/scraper.service.js'
import { tryOoclHiddenAPI } from './oocl/hiddenApi.service.js'
import { scrapeOoclCheerio, scrapeOoclPlaywright } from './oocl/scraper.service.js'
import { tryCoscoHiddenAPI } from './cosco/hiddenApi.service.js'
import { scrapeCoscoCheerio, scrapeCoscoPlaywright } from './cosco/scraper.service.js'

const ADAPTERS: Record<string, CarrierAdapter> = {
  maersk: { name: 'Maersk', prefixes: [], track: async (cn) => (await tryMaerskHiddenAPI(cn)) || (await scrapeMaerskCheerio(cn)) || (await scrapeMaerskPlaywright(cn)) },
  hapag: { name: 'Hapag-Lloyd', prefixes: [], track: async (cn) => (await tryHapagHiddenAPI(cn)) || (await scrapeHapagCheerio(cn)) || (await scrapeHapagPlaywright(cn)) },
  cma: { name: 'CMA-CGM', prefixes: [], track: async (cn) => (await tryCMAHiddenAPI(cn)) || (await scrapeCMACheerio(cn)) || (await scrapeCMAPlaywright(cn)) },
  msc: { name: 'MSC', prefixes: [], track: async (cn) => (await tryMscHiddenAPI(cn)) || (await scrapeMscCheerio(cn)) || (await scrapeMscPlaywright(cn)) },
  one: { name: 'ONE', prefixes: [], track: async (cn) => (await tryOneHiddenAPI(cn)) || (await scrapeOneCheerio(cn)) || (await scrapeOnePlaywright(cn)) },
  oocl: { name: 'OOCL', prefixes: [], track: async (cn) => (await tryOoclHiddenAPI(cn)) || (await scrapeOoclCheerio(cn)) || (await scrapeOoclPlaywright(cn)) },
  cosco: { name: 'COSCO', prefixes: [], track: async (cn) => (await tryCoscoHiddenAPI(cn)) || (await scrapeCoscoCheerio(cn)) || (await scrapeCoscoPlaywright(cn)) },
}

const CARRIER_NAME_TO_KEY: Record<string, string> = {
  maersk: 'maersk', 'hapag-lloyd': 'hapag', 'cma-cgm': 'cma',
  msc: 'msc', one: 'one', oocl: 'oocl', cosco: 'cosco',
}

function adapterKeyFromCarrierName(name: string): string | null {
  return CARRIER_NAME_TO_KEY[name.trim().toLowerCase()] || null
}

export async function trackContainer(containerNo: string, carrierHint?: string): Promise<ScrapeResult> {
  if (!carrierHint) {
    return { source: 'simulated', data: null }
  }

  const key = adapterKeyFromCarrierName(carrierHint)
  const adapter = key ? ADAPTERS[key] : null
  if (!adapter) {
    return { source: 'simulated', data: null }
  }

  try {
    const data = await withRetry(() => adapter.track(containerNo), { maxAttempts: 1, baseDelayMs: 1000 })
    if (data) return { source: 'hidden_api', data }
  } catch {}

  return { source: 'simulated', data: null }
}

export { ADAPTERS }
