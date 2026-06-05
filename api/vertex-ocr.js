export const config = { runtime: 'edge' }

const VERTEX_REGION = 'asia-south1'
const MODEL = 'gemini-2.0-flash-001'

async function getAccessToken(clientEmail, privateKeyB64) {
  const now = Math.floor(Date.now() / 1000)

  const toB64Url = (ab) => {
    const bytes = new Uint8Array(ab)
    let str = ''
    for (const b of bytes) str += String.fromCharCode(b)
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }

  const enc = new TextEncoder()

  const headerB64  = toB64Url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payloadB64 = toB64Url(enc.encode(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })))

  const signingInput = `${headerB64}.${payloadB64}`

  // privateKeyB64 is the base64 encoding of the PEM string
  // Decode it back to PEM, then extract DER
  const pemStr = atob(privateKeyB64)
  const derB64 = pemStr
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  const derBytes = Uint8Array.from(atob(derB64), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8', derBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, enc.encode(signingInput)
  )

  const jwt = `${signingInput}.${toB64Url(sig)}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error(`Token error: ${JSON.stringify(tokenData)}`)
  return tokenData.access_token
}

// TEMPORARY DEBUG — remove after testing
if (req.method === 'GET') {
  const raw = process.env.VITE_VERTEX_PRIVATE_KEY || ''
  return new Response(JSON.stringify({
    length: raw.length,
    first30: raw.substring(0, 30),
    last30: raw.substring(raw.length - 30),
    hasNewlines: raw.includes('\n'),
    hasLiteralBackslashN: raw.includes('\\n'),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export default async function handler(req) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }

  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })

  try {
    const { images, prompt } = await req.json()

    if (!images || !prompt) {
      return new Response(JSON.stringify({ error: 'Missing images or prompt' }), { status: 400, headers: corsHeaders })
    }

    const projectId      = process.env.VITE_VERTEX_PROJECT_ID
    const clientEmail    = process.env.VITE_VERTEX_CLIENT_EMAIL
    const privateKeyB64  = process.env.VITE_VERTEX_PRIVATE_KEY || ''

    if (!projectId || !clientEmail || !privateKeyB64) {
      return new Response(JSON.stringify({ error: 'Vertex AI credentials not configured' }), { status: 500, headers: corsHeaders })
    }

    const accessToken = await getAccessToken(clientEmail, privateKeyB64)

    const parts = [
      { text: prompt },
      ...images.map(img => ({ inline_data: { mime_type: img.mimeType || 'image/jpeg', data: img.base64 } }))
    ]

    const vertexUrl = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${VERTEX_REGION}/publishers/google/models/${MODEL}:generateContent`

    const vertexRes = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    })

    if (!vertexRes.ok) {
      const err = await vertexRes.json().catch(() => ({}))
      return new Response(JSON.stringify({ error: err?.error?.message || `Vertex AI error ${vertexRes.status}` }), { status: 502, headers: corsHeaders })
    }

    const data = await vertexRes.json()
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n')

    if (!text) return new Response(JSON.stringify({ error: 'Empty response from Vertex AI' }), { status: 502, headers: corsHeaders })

    return new Response(JSON.stringify({ text }), { status: 200, headers: corsHeaders })

  } catch (err) {
    console.error('[vertex-ocr] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
}
