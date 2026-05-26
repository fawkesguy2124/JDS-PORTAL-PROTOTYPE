import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { config } from '../config.js'
import { delay } from './delay.js'

let browser: Browser | null = null
let context: BrowserContext | null = null
let lastUsed = 0
const IDLE_TIMEOUT = 10 * 60 * 1000

export async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) {
    lastUsed = Date.now()
    return browser
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: config.playwright.browserPath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })
  lastUsed = Date.now()
  return browser
}

export async function getContext(): Promise<BrowserContext> {
  const b = await getBrowser()
  if (context && !context.pages().every((p) => p.isClosed())) {
    return context
  }
  context = await b.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  return context
}

export async function scrapeWithPlaywright(
  url: string,
  options: {
    waitForSelector?: string
    waitForMs?: number
    evaluate?: string
  } = {}
): Promise<string | null> {
  let page: Page | null = null
  try {
    const ctx = await getContext()
    page = await ctx.newPage()

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    if (options.waitForMs) {
      await delay(options.waitForMs)
    }
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 15000 }).catch(() => {})
    }

    if (options.evaluate) {
      return await page.evaluate(options.evaluate) as string
    }

    return await page.content()
  } finally {
    if (page) await page.close().catch(() => {})
  }
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close().catch(() => {})
    context = null
  }
  if (browser) {
    await browser.close().catch(() => {})
    browser = null
  }
}

setInterval(async () => {
  if (browser && Date.now() - lastUsed > IDLE_TIMEOUT) {
    await closeBrowser()
  }
}, 60_000)

process.on('exit', () => closeBrowser())
process.on('SIGTERM', () => closeBrowser())
process.on('SIGINT', () => closeBrowser())
