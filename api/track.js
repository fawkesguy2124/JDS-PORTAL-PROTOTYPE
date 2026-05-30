import { getMSCTracking }      from './providers/msc.js'
import { getONETracking }      from './providers/one.js'
import { getEvergreenTracking } from './providers/evergreen.js'
import { getCMACGMTracking }   from './providers/cmacgm.js'
import { getHapagTracking }    from './providers/hapag.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const container = searchParams.get('container')?.trim().toUpperCase()
  const carrier   = searchParams.get('carrier')?.trim()

  if (!container || !carrier) {
    return new Response(JSON.stringify({ error: 'container and carrier required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    let result
    switch (carrier.toLowerCase()) {
      case 'msc':        result = await getMSCTracking(container);      break
      case 'one':        result = await getONETracking(container);      break
      case 'evergreen':  result = await getEvergreenTracking(container); break
      case 'cma-cgm':
      case 'cma cgm':    result = await getCMACGMTracking(container);   break
      case 'hapag-lloyd':
      case 'hapag lloyd': result = await getHapagTracking(container);   break
      default:
        return new Response(JSON.stringify({ error: `Carrier ${carrier} not yet supported` }), {
          status: 404, headers: { 'Content-Type': 'application/json' }
        })
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}
