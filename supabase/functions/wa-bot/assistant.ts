// The WhatsApp assistant: Gemini (free tier) reads the question and answers using
// the read-only portal tools in _shared/portal/assistantTools.js. It only ever
// sees job facts from those tools, never documents, and never calls ULIP.
//
// Secrets: GEMINI_API_KEY (required); GEMINI_MODEL (optional, default below).
import { TOOLS, runTool, SYSTEM_PROMPT } from '../_shared/portal/assistantTools.js'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
// tried in order; a model Google has retired (404) is skipped
const MODELS = () => [Deno.env.get('GEMINI_MODEL'), 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'].filter(Boolean) as string[]
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
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT(person) }] },
    tools: [{ functionDeclarations: TOOLS }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 512 } },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIME_LIMIT_MS)
  try {
    for (const model of MODELS()) {
      let rounds = 0
      const convo = [...contents]
      while (rounds <= MAX_TOOL_ROUNDS) {
        const { status, out } = await callGemini(model, { ...base, contents: convo }, key, controller.signal)
        if (status === 404) break // model retired: try the next one
        if (status === 429) return { text: null, note: `quota (${model})` }
        if (status >= 400) return { text: null, note: `gemini ${status}: ${String(out?.error?.message || '').slice(0, 120)}` }
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
      if (rounds > MAX_TOOL_ROUNDS) return { text: null, note: 'too many tool rounds' }
    }
    return { text: null, note: 'no Gemini model available' }
  } catch (e) {
    return { text: null, note: (e as Error).name === 'AbortError' ? 'gemini timed out' : (e as Error).message }
  } finally {
    clearTimeout(timer)
  }
}
