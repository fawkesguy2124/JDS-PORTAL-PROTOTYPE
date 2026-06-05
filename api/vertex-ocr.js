export const config = { runtime: 'edge' }

const VERTEX_REGION = 'asia-south1'
const MODEL = 'gemini-2.0-flash-001'

async function getAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000)

  const base64url = (str) =>
    btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const base64urlJson = (obj) => base64url(JSON.stringify(obj))

  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }

  const signingInput = `${base64urlJson(header)}.${base64urlJson(payload)}`

  // Clean the private key — handle all possible formats from env vars
  let cleanedKey = privateKey
  // Replace literal \n strings with actual newlines
  cleanedKey = cleanedKey.replace(/\\n/g, '\n')
  // Ensure proper PEM format
  if (!cleanedKey.includes('\n')) {
    // Key has no newlines at all — reformat it
    cleanedKey = cleanedKey
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----')
  }

  // Extract just the base64 body
  const pemBody = cleanedKey
    .split('\n')
    .filter(line => line.trim() && !line.includes('-----'))
    .join('')

  // Decode base64 to binary
  const binaryStr = atob(pemBody)
  const binaryKey = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    binaryKey[i] = binaryStr.charCodeAt(i)
  }

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const encoder = new TextEncoder()
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput)
  )

  const signatureArr = new Uint8Array(signatureBuffer)
  let signatureStr = ''
  for (let i = 0; i < signatureArr.length; i++) {
    signatureStr += String.fromCharCode(signatureArr[i])
  }
  const signature = btoa(signatureStr)
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signingInput}.${signature}`

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

export default async function handler(req) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { images, prompt } = body

    if (!images || !prompt) {
      return new Response(JSON.stringify({ error: 'Missing images or prompt' }), { status: 400, headers: corsHeaders })
    }

    const projectId   = process.env.VITE_VERTEX_PROJECT_ID
    const clientEmail = process.env.VITE_VERTEX_CLIENT_EMAIL
    const privateKey  = process.env.VITE_VERTEX_PRIVATE_KEY || ''

    if (!projectId || !clientEmail || !privateKey) {
      return new Response(JSON.stringify({ error: 'Vertex AI credentials not configured' }), { status: 500, headers: corsHeaders })
    }

    const accessToken = await getAccessToken(clientEmail, privateKey)

    const parts = [
      { text: prompt },
      ...images.map(img => ({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.base64,
        }
      }))
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
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    })

    if (!vertexRes.ok) {
      const err = await vertexRes.json().catch(() => ({}))
      return new Response(JSON.stringify({ error: err?.error?.message || `Vertex AI error ${vertexRes.status}` }), { status: 502, headers: corsHeaders })
    }

    const data = await vertexRes.json()
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n')

    if (!text) {
      return new Response(JSON.stringify({ error: 'Vertex AI returned empty response' }), { status: 502, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ text }), { status: 200, headers: corsHeaders })

  } catch (err) {
    console.error('[vertex-ocr] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
}
