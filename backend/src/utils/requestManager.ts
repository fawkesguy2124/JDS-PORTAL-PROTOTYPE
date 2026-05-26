import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { config } from '../config.js'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
]

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

export function createHttpClient(defaults?: AxiosRequestConfig): AxiosInstance {
  const client = axios.create({
    timeout: 8000,
    headers: {
      'User-Agent': pickUserAgent(),
      Accept: 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    ...defaults,
  })

  if (config.proxy.url) {
    client.defaults.proxy = { host: config.proxy.url, port: 80 }
  }

  return client
}

export const http = createHttpClient()
