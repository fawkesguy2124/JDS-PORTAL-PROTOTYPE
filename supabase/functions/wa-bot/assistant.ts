// The WhatsApp assistant: Gemini (free tier) reads the question and answers using
// the read-only portal tools in _shared/portal/assistantTools.js. It only ever
// sees job facts from those tools, never documents, and never calls ULIP.
//
// Secrets: GEMINI_API_KEY (required); GEMINI_MODEL (optional, default below).
import { TOOLS, runTool, SYSTEM_PROMPT, TODAY_BRIEF } from '../_shared/portal/assistantTools.js'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
// tried in order; a model Google has retired (404) is skipped
// an overloaded (503) or rate-limited (429) model is retried once, then the next is tried
// The model that answered last time goes first (Google's busy models change during the day).
let lastGood: string | null = null
// models that refused "thinking off" don't get that setting again
const noThinkingSetting = new Set<string>()
const MODELS = () => [...new Set([lastGood, Deno.env.get('GEMINI_MODEL'), 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))] as string[]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const MAX_TOOL_ROUNDS = 5
const TIME_LIMIT_MS = 25_000 // Gemini's share; Groq gets its own time after it

type Turn = { role: 'user' | 'model'; text: string }
type Person = { id: string; name: string; role: string; phone: string }

async function callGemini(model: string, body: unknown, key: string, signal: AbortSignal) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal,
  })
  const out = await res.json().catch(() => ({}))
  return { status: res.status, out }
}

// Returns the reply text, or null when the assistant is not available
// (no key, quota used up, Google down) so the bot can fall back.
// Gemini first; Groq (US, free tier) only when every Gemini model is busy or down
export async function askAssistant(question: string, history: Turn[], data: unknown, person: Person): Promise<{ text: string | null; note: string }> {
  const g = await askGemini(question, history, data, person)
  if (g.text) return g
  const q = await askGroq(question, history, data, person)
  return q.text ? { text: q.text, note: `${q.note} (Gemini: ${g.note})` } : { text: null, note: `Gemini: ${g.note} | Groq: ${q.note}` }
}

// ── Groq (OpenAI-style API) ──
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODELS = () => [...new Set([Deno.env.get('GROQ_MODEL'), 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b'].filter(Boolean))] as string[]
// the tool list in plain JSON-schema form (Gemini writes types in capitals)
const lowerTypes = (s: any): any => (Array.isArray(s) ? s.map(lowerTypes) : s && typeof s === 'object'
  ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : lowerTypes(v)])) : s)
const GROQ_TOOLS = TOOLS.map((t: any) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: lowerTypes(t.parameters) } }))

async function askGroq(question: string, history: Turn[], data: unknown, person: Person): Promise<{ text: string | null; note: string }> {
  const key = (Deno.env.get('GROQ_API_KEY') || '').trim()
  if (!key) return { text: null, note: 'no GROQ_API_KEY' }
  const messages: any[] = [
    { role: 'system', content: `${SYSTEM_PROMPT(person)}\n\n${TODAY_BRIEF(data, person)}` },
    ...history.slice(-8).map((t) => ({ role: t.role === 'model' ? 'assistant' : 'user', content: t.text })),
    { role: 'user', content: question },
  ]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  const tried: string[] = []
  try {
    for (const model of GROQ_MODELS()) {
      const convo = [...messages]
      let rounds = 0
      let skip = false
      while (rounds <= MAX_TOOL_ROUNDS) {
        const res = await fetch(GROQ_API, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: convo, tools: GROQ_TOOLS, tool_choice: 'auto', temperature: 0.2, max_tokens: 900 }),
          signal: controller.signal,
        })
        const out = await res.json().catch(() => ({}))
        if (res.status === 404 || res.status === 429 || res.status >= 500 || (res.status === 400 && /model/i.test(out?.error?.message || ''))) {
          tried.push(`${model}: ${res.status}`); skip = true; break
        }
        if (!res.ok) return { text: null, note: `groq ${res.status}: ${String(out?.error?.message || '').slice(0, 120)}` }
        const msg = out?.choices?.[0]?.message || {}
        const calls: any[] = msg.tool_calls || []
        if (!calls.length) {
          const text = String(msg.content || '').trim()
          return text ? { text, note: `groq ${model}, ${rounds} tool round(s)` } : { text: null, note: 'groq empty answer' }
        }
        convo.push({ role: 'assistant', content: msg.content || '', tool_calls: calls })
        for (const c of calls) {
          let result: unknown
          try { result = runTool(c.function?.name, JSON.parse(c.function?.arguments || '{}'), data, person) } catch (e) { result = { error: (e as Error).message } }
          convo.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result).slice(0, 12000) })
        }
        rounds++
      }
      if (!skip) return { text: null, note: 'groq too many tool rounds' }
    }
    return { text: null, note: `all Groq models busy (${tried.join(', ')})` }
  } catch (e) {
    return { text: null, note: (e as Error).name === 'AbortError' ? 'groq timed out' : (e as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

async function askGemini(question: string, history: Turn[], data: unknown, person: Person): Promise<{ text: string | null; note: string }> {
  const key = (Deno.env.get('GEMINI_API_KEY') || '').trim()
  if (!key) return { text: null, note: 'no GEMINI_API_KEY' }

  const contents: any[] = [
    ...history.slice(-8).map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: 'user', parts: [{ text: question }] },
  ]
  const base = {
    // today's basics up front, so simple questions need no tool round trip
    systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT(person)}\n\n${TODAY_BRIEF(data, person)}` }] },
    tools: [{ functionDeclarations: TOOLS }],
    // thinking off: much faster, and the tools give it the facts anyway
    generationConfig: { temperature: 0.2, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIME_LIMIT_MS)
  try {
    const tried: string[] = []
    const models = MODELS()
    for (const [i, model] of models.entries()) {
      let rounds = 0
      let retried = false
      let skip = false
      const { thinkingConfig, ...plain } = base.generationConfig
      let config: any = noThinkingSetting.has(model) ? plain : { ...plain, thinkingConfig }
      const convo = [...contents]
      while (rounds <= MAX_TOOL_ROUNDS) {
        const { status, out } = await callGemini(model, { ...base, generationConfig: config, contents: convo }, key, controller.signal)
        if (status === 404) { tried.push(`${model}: not available`); skip = true; break }
        if (status === 429 || status >= 500) {
          // busy: go straight to the next model; only the last one gets a short wait and retry
          if (i === models.length - 1 && !retried) { retried = true; await sleep(1500); continue }
          if (lastGood === model) lastGood = null
          tried.push(`${model}: ${status}`); skip = true; break
        }
        if (status === 400 && config.thinkingConfig) {
          // some models don't accept "thinking off": ask again without that setting, and remember
          console.warn(`[wa-bot] ${model} refused the thinking setting (${String(out?.error?.message || '').slice(0, 160)}); retrying without it`)
          noThinkingSetting.add(model)
          config = plain
          continue
        }
        if (status >= 400) {
          tried.push(`${model}: ${status} ${String(out?.error?.message || '').slice(0, 100)}`)
          console.warn(`[wa-bot] ${model} error detail: ${JSON.stringify(out?.error?.details || out?.error || {}).slice(0, 400)}`)
          skip = true; break // try the next model
        }
        const content = out?.candidates?.[0]?.content
        const parts: any[] = content?.parts || []
        const calls = parts.filter((p) => p.functionCall)
        if (!calls.length) {
          const text = parts.map((p) => p.text || '').join('').trim()
          if (text) lastGood = model
          return text ? { text, note: `${model}, ${rounds} tool round(s)${tried.length ? ` (skipped ${tried.join(', ')})` : ''}` } : { text: null, note: `empty answer (${out?.candidates?.[0]?.finishReason || 'no candidate'})` }
        }
        // run the tools the model asked for and hand back the results
        convo.push({ role: 'model', parts })
        convo.push({
          role: 'user',
          parts: calls.map((p) => {
            let result: unknown
            try { result = runTool(p.functionCall.name, p.functionCall.args || {}, data, person) } catch (e) { result = { error: (e as Error).message } }
            return { functionResponse: { name: p.functionCall.name, response: { result } } }
          }),
        })
        rounds++
      }
      if (!skip && rounds > MAX_TOOL_ROUNDS) return { text: null, note: 'too many tool rounds' }
    }
    return { text: null, note: `all Gemini models busy (${tried.join(', ')})` }
  } catch (e) {
    return { text: null, note: (e as Error).name === 'AbortError' ? 'gemini timed out' : (e as Error).message }
  } finally {
    clearTimeout(timer)
  }
}
