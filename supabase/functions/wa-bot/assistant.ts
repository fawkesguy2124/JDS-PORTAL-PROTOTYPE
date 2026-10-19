// The WhatsApp assistant: Gemini (free tier) reads the question and answers using
// the read-only portal tools in _shared/portal/assistantTools.js. It only ever
// sees job facts from those tools, never documents, and never calls ULIP.
//
// Secrets: GEMINI_API_KEY (required); GEMINI_MODEL (optional, default below).
import { TOOLS, runTool, SYSTEM_PROMPT, TODAY_BRIEF } from '../_shared/portal/assistantTools.js'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
// tried in order; a model Google has retired (404) is skipped
// an overloaded (503) or rate-limited (429) model is retried once, then the next is tried
const MODELS = () => [...new Set([Deno.env.get('GEMINI_MODEL'), 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))] as string[]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const MAX_TOOL_ROUNDS = 5
const TIME_LIMIT_MS = 45_000

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
export async function askAssistant(question: string, history: Turn[], data: unknown, person: Person): Promise<{ text: string | null; note: string }> {
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
    for (const model of MODELS()) {
      let rounds = 0
      let retried = false
      let skip = false
      let config: any = base.generationConfig
      const convo = [...contents]
      while (rounds <= MAX_TOOL_ROUNDS) {
        const { status, out } = await callGemini(model, { ...base, generationConfig: config, contents: convo }, key, controller.signal)
        if (status === 404) { tried.push(`${model}: not available`); skip = true; break }
        if (status === 429 || status >= 500) {
          if (!retried) { retried = true; await sleep(2000); continue } // busy: one quick retry
          tried.push(`${model}: ${status}`); skip = true; break // still busy: next model
        }
        if (status === 400 && config.thinkingConfig) {
          // some models don't accept "thinking off": ask again without that setting
          console.warn(`[wa-bot] ${model} refused the request (${String(out?.error?.message || '').slice(0, 160)}); retrying without the thinking setting`)
          const { thinkingConfig: _drop, ...rest } = config
          config = rest
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
          return text ? { text, note: `${model}, ${rounds} tool round(s)` } : { text: null, note: `empty answer (${out?.candidates?.[0]?.finishReason || 'no candidate'})` }
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
