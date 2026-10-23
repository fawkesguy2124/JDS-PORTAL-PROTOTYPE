// Voice notes and files on WhatsApp (Jose, 24 Oct 2026).
// - Voice notes are turned into text by Groq's Whisper (US-hosted, the same Groq
//   account the bot already uses) and then answered like a typed message.
// - Files the team sends are kept in the PRIVATE "job-documents" storage and
//   attached to a job after a YES. They are never sent to any AI.
// - Files the team asks for are sent from that storage as WhatsApp documents.
const GRAPH = 'https://graph.facebook.com/v21.0'
const env = (k: string) => (Deno.env.get(k) || '').trim()
const auth = () => ({ Authorization: `Bearer ${env('WHATSAPP_TOKEN')}` })

export const MAX_FILE_BYTES = 10 * 1024 * 1024 // same limit as the portal's upload

// A file the person sent: WhatsApp gives an id, then a short-lived link to it
export async function downloadMedia(id: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const meta = await fetch(`${GRAPH}/${id}`, { headers: auth() }).then((r) => r.json())
  if (!meta?.url) throw new Error(meta?.error?.message || 'WhatsApp did not give the file')
  if (Number(meta.file_size) > MAX_FILE_BYTES) throw new Error('the file is over 10 MB')
  const res = await fetch(meta.url, { headers: auth() })
  if (!res.ok) throw new Error(`could not download the file (${res.status})`)
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: String(meta.mime_type || res.headers.get('content-type') || '') }
}

// Voice note → text. The prompt lists the words the team uses, so Whisper spells
// them right (job numbers, OOC, BE …). Hindi and English both work.
const VOCAB = 'JDS Logistics. Job J-652, J-677. OOC, BE, BL, IGM, CFS, ICD, DO, FASTag, LDB, detention, free days, Nhava Sheva, JNPT, container, truck, rail, PCM, Vendekin, Divine.'
export async function transcribe(bytes: Uint8Array, mime: string): Promise<string> {
  const key = env('GROQ_API_KEY')
  if (!key) throw new Error('no GROQ_API_KEY')
  const ext = /mpeg|mp3/.test(mime) ? 'mp3' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : 'ogg'
  for (const model of ['whisper-large-v3-turbo', 'whisper-large-v3']) {
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: mime || 'audio/ogg' }), `voice.${ext}`)
    form.append('model', model)
    form.append('prompt', VOCAB)
    form.append('temperature', '0')
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(30_000),
    })
    const out = await res.json().catch(() => ({}))
    if (res.ok && typeof out?.text === 'string') return out.text.trim()
    console.warn(`[wa-bot] ${model} could not transcribe: ${res.status} ${String(out?.error?.message || '').slice(0, 120)}`)
  }
  throw new Error('the voice note could not be understood')
}

// Sends a stored file as a WhatsApp document
export async function sendDocument(to: string, bytes: Uint8Array, mime: string, filename: string, caption: string) {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', mime)
  form.append('file', new Blob([bytes], { type: mime }), filename)
  const up = await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_ID')}/media`, { method: 'POST', headers: auth(), body: form }).then((r) => r.json())
  if (!up?.id) throw new Error(up?.error?.message || 'WhatsApp did not take the file')
  const res = await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_ID')}/messages`, {
    method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'document', document: { id: up.id, filename, caption: caption.slice(0, 1000) } }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out?.error?.message || `HTTP ${res.status}`)
}

// What kind of paper a file is, from its name (the person can correct it)
const TYPES: [RegExp, string][] = [
  [/out\s*of\s*charge|\booc\b/i, 'OOC'], [/bill\s*of\s*entry|processed[\s_]*be|\bbe[\s_-]*\d|\bbe\b/i, 'BE'],
  [/bill\s*of\s*lading|\bh?m?bl\b|bldraft|\bhbl\b|\bmbl\b|waybill|\bawb\b/i, 'BL'], [/packing/i, 'Packing List'],
  [/invoice|\binv\b/i, 'Invoice'], [/\bcoo\b|certificate\s*of\s*origin/i, 'COO'], [/insurance|policy/i, 'Insurance'],
  [/e-?\s*way|ewb/i, 'E-Way Bill'], [/\bpod\b|proof\s*of\s*delivery/i, 'POD'], [/exam/i, 'Examination Order'],
]
export const docTypeFromName = (name: string) => TYPES.find(([re]) => re.test(name))?.[1] || null

// Which job a file is for, from the caption or the file name ("J-652", "BE_652_…")
export function jobFromText(text: string, jobs: any[]): any | null {
  const t = String(text || '')
  const nos = [...t.matchAll(/\bJ-?\s?0*(\d{1,5})\b/gi), ...t.matchAll(/(?:^|[\s_-])(?:BE|OOC|Charge)[\s_-]*0*(\d{2,5})(?=[\s_.-])/gi)].map((m) => m[1])
  for (const n of nos) {
    const job = jobs.find((j: any) => String(j.job_no || '').replace(/\D/g, '').replace(/^0+/, '') === n.replace(/^0+/, ''))
    if (job) return job
  }
  return null
}

export const safeName = (name: string) => String(name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
