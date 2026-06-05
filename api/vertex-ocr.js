export const config = { runtime: 'edge' }

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

    const apiKey = process.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), { status: 500, headers: corsHeaders })
    }

    const parts = [
      { text: prompt },
      ...images.map(img => ({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.base64,
        }
      }))
    ]

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return new Response(JSON.stringify({ error: err?.error?.message || `Gemini error ${res.status}` }), { status: 502, headers: corsHeaders })
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n')

    if (!text) return new Response(JSON.stringify({ error: 'Empty response' }), { status: 502, headers: corsHeaders })

    return new Response(JSON.stringify({ text }), { status: 200, headers: corsHeaders })

  } catch (err) {
    console.error('[vertex-ocr] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
}
