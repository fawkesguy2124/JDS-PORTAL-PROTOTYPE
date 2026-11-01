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

// Voice note → text. The prompt lists the words the team uses (and the real open
// job numbers and clients), so Whisper spells them right. Hindi and English both
// work. The more accurate large model goes first; the fast one is the fallback.
const VOCAB = 'JDS Logistics. OOC, BE, BL, IGM, CFS, ICD, DO, FASTag, LDB, detention, free days, Nhava Sheva, JNPT, container, truck, rail.'
export async function transcribe(bytes: Uint8Array, mime: string, words = ''): Promise<string> {
  const key = env('GROQ_API_KEY')
  if (!key) throw new Error('no GROQ_API_KEY')
  const ext = /mpeg|mp3/.test(mime) ? 'mp3' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : 'ogg'
  const prompt = `${VOCAB} ${words}`.slice(0, 800)
  for (const model of ['whisper-large-v3', 'whisper-large-v3-turbo']) {
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: mime || 'audio/ogg' }), `voice.${ext}`)
    form.append('model', model)
    form.append('prompt', prompt)
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

// What was said → how the team writes it: "job six five two" → J-652,
// "C C L U 7 8 8 5 8 7 4" → CCLU7885874, "M H 46 C S 6001" → MH46CS6001.
const DIGIT: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', to: '2', too: '2', three: '3', four: '4', for: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  // Hindi / Hinglish
  shunya: '0', ek: '1', do: '2', teen: '3', tin: '3', char: '4', chaar: '4', paanch: '5', panch: '5', chhe: '6', che: '6', chhah: '6', saat: '7', sat: '7', aath: '8', aat: '8', nau: '9', no: '9',
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 }
const SMALL: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }

// "six five two" / "six hundred and fifty two" / "double five two" → "652"
function wordsToNumber(words: string[]): string | null {
  const w = words.map((x) => x.toLowerCase())
  if (w.includes('hundred')) {
    let total = 0, i = 0
    if (SMALL[w[i]] && w[i + 1] === 'hundred') { total = SMALL[w[i]] * 100; i += 2 } else return null
    if (w[i] === 'and') i++
    if (TEENS[w[i]] != null) { total += TEENS[w[i]]; i++ }
    else { if (TENS[w[i]] != null) { total += TENS[w[i]]; i++ } if (SMALL[w[i]] != null) { total += SMALL[w[i]]; i++ } }
    return i === w.length ? String(total) : null
  }
  let out = ''
  for (let i = 0; i < w.length; i++) {
    if ((w[i] === 'double' || w[i] === 'triple') && DIGIT[w[i + 1]]) { out += DIGIT[w[i + 1]].repeat(w[i] === 'double' ? 2 : 3); i++; continue }
    if (DIGIT[w[i]]) { out += DIGIT[w[i]]; continue }
    if (/^\d+$/.test(w[i])) { out += w[i]; continue }
    return null
  }
  return out || null
}

export function normalizeSpoken(text: string): string {
  let t = String(text || '').trim()
  // "job 652" / "job number six five two" / "J six five two" → J-652
  const NUMWORD = '(?:\\d+|zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple|hundred|and|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|ek|do|teen|char|chaar|paanch|panch|chhe|saat|aath|nau|shunya)'
  t = t.replace(new RegExp(`\\b(?:job|jay|j)(?:\\s+(?:number|no\\.?|nambar))?[\\s.-]*((?:${NUMWORD}[\\s,-]*){1,8})`, 'gi'), (all, nums: string) => {
    // the longest run of words that is a number ("six five two and …" → 652, "and …" kept)
    const toks = nums.trim().split(/[\s,-]+/).filter(Boolean)
    for (let k = toks.length; k > 0; k--) {
      const n = wordsToNumber(toks.slice(0, k))
      if (n && n.length <= 5) return `J-${n} ${toks.slice(k).join(' ')}${/\s$/.test(all) ? ' ' : ''}`
    }
    return all
  })
  // letters and digits said one by one: join them when they make a container or truck number
  // (digits may be said as words too: "M H four six C S six zero zero one")
  const piece = '(?:[A-Za-z0-9]{1,4}|zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple)'
  t = t.replace(new RegExp(`\\b(?:${piece}\\s+){3,}${piece}\\b`, 'gi'), (seq: string) => {
    const toks = seq.split(/\s+/)
    // try every run inside the words, longest first, so "truck M H 46 …" still matches
    for (let a = 0; a < toks.length; a++) {
      for (let b = toks.length; b - a >= 4; b--) {
        let joined = ''
        let ok = true
        for (let i = a; i < b; i++) {
          const w = toks[i].toLowerCase()
          if ((w === 'double' || w === 'triple') && DIGIT[toks[i + 1]?.toLowerCase()] && i + 1 < b) { joined += DIGIT[toks[i + 1].toLowerCase()].repeat(w === 'double' ? 2 : 3); i++; continue }
          if (w.length > 1 && DIGIT[w] && !['do', 'to', 'no', 'for', 'too', 'sat', 'che', 'tin'].includes(w)) { joined += DIGIT[w]; continue }
          if (/^[a-z0-9]{1,4}$/i.test(toks[i]) && (toks[i].length === 1 || /^\d+$/.test(toks[i]) || /^[A-Z]{2,4}$/.test(toks[i]))) { joined += toks[i].toUpperCase(); continue }
          ok = false; break
        }
        if (ok && (/^[A-Z]{4}\d{7}$/.test(joined) || /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{3,4}$/.test(joined))) {
          return [...toks.slice(0, a), joined, ...toks.slice(b)].join(' ')
        }
      }
    }
    return seq
  })
  return t.replace(/\s{2,}/g, ' ').replace(/\s+([?.!,])/g, '$1').trim()
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

// the job numbers in a caption / file name ("J-652", LiveImpex's "Processed_BE_652_…")
const jobNosIn = (text: string) => {
  const t = String(text || '')
  return [...t.matchAll(/\bJ-?\s?0*(\d{1,5})\b/gi), ...t.matchAll(/(?:^|[\s_-])(?:BE|OOC|Charge)[\s_-]*0*(\d{2,5})(?=[\s_.-])/gi)].map((m) => m[1])
}
// the job number a file names, for a job the portal doesn't have yet ("J-736")
export const jobNoFromText = (text: string) => { const n = jobNosIn(text)[0]; return n ? `J-${n.replace(/^0+/, '')}` : null }

// Which job a file is for, from the caption or the file name ("J-652", "BE_652_…")
export function jobFromText(text: string, jobs: any[]): any | null {
  const nos = jobNosIn(text)
  for (const n of nos) {
    const job = jobs.find((j: any) => String(j.job_no || '').replace(/\D/g, '').replace(/^0+/, '') === n.replace(/^0+/, ''))
    if (job) return job
  }
  return null
}

export const safeName = (name: string) => String(name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
