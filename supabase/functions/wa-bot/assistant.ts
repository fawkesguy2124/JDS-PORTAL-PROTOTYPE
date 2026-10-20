// The WhatsApp assistant: Gemini (free tier) reads the question and answers using
// the read-only portal tools in _shared/portal/assistantTools.js. It only ever
// sees job facts from those tools, never documents, and never calls ULIP.
//
// Secrets: GEMINI_API_KEY (required); GEMINI_MODEL (optional, default below).
import { TOOLS as READ_TOOLS, runTool, SYSTEM_PROMPT, TODAY_BRIEF } from '../_shared/portal/assistantTools.js'
import { CHANGE_TOOL, prepareChange, type Pending } from './actions.ts'

// read tools + the one tool that PROPOSES a change (saved only after a YES)
const TOOLS = [...READ_TOOLS, CHANGE_TOOL]

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
// tried in order; a model Google has retired (404) is skipped
// an overloaded (503) or rate-limited (429) model is retried once, then the next is tried
// The model that answered last time goes first (Google's busy models change during the day).
let lastGood: string | null = null
// models that refused "thinking off" don't get that setting again
const noThinkingSetting = new Set<string>()
// (the 2.5 models were retired by Google; the "-latest" names follow the current ones)
const MODELS = () => [...new Set([lastGood, Deno.env.get('GEMINI_MODEL'), 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))] as string[]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const MAX_TOOL_ROUNDS = 5
const TIME_LIMIT_MS = 25_000 // Gemini's share; Groq gets its own time after it
const PER_MODEL_MS = 12_000 // one Gemini model's turn (one round of talk)

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
// Order (Jose, 20 Oct 2026): DeepSeek on OpenCode first (OpenCode runs it on
// US/EU servers, not DeepSeek's own in China), then Groq (US), then Gemini.
// Each is tried only when the one before is busy, slow or not set up.
// `checked` lists the portal checks behind the answer; the bot keeps it with the
// chat history, so a follow-up ("what about CFS OUT", "are you sure?") knows
// exactly what was looked at last time
export async function askAssistant(question: string, history: Turn[], data: unknown, person: Person): Promise<{ text: string | null; note: string; checked: string[]; proposal: Pending | null }> {
  const used: string[] = []
  const ctx: Ctx = { used, proposal: null }
  const d = await askCompat(OPENCODE, question, history, data, person, ctx)
  if (d.text || ctx.proposal) return { ...d, checked: used, proposal: ctx.proposal }
  const q = await askCompat(GROQ, question, history, data, person, ctx)
  if (q.text || ctx.proposal) return { ...q, note: `${q.note} (OpenCode: ${d.note})`, checked: used, proposal: ctx.proposal }
  const g = await askGemini(question, history, data, person, ctx)
  return g.text || ctx.proposal ? { text: g.text, note: `${g.note} (OpenCode: ${d.note}; Groq: ${q.note})`, checked: used, proposal: ctx.proposal } : { text: null, note: `OpenCode: ${d.note} | Groq: ${q.note} | Gemini: ${g.note}`, checked: used, proposal: null }
}
// Questions about JDS's own jobs/containers MUST be checked in the portal first:
// small models otherwise answer from memory and make things up. Pure "what is
// an IGM" questions are left free.
export const needsData = (q: string) => {
  const t = String(q || '').trim()
  if (/^(what is|what's|what are|what does|meaning of|explain|define|how does)\b/i.test(t) && !/\b[A-Z]{4}\d{7}\b|\bJ-?\s?\d+|\bour\b|\bmy\b|\bjds\b/i.test(t)) return false
  // whole words only ("port" must not match "portal")
  return /\b[A-Z]{4}\d{7}\b|\bJ-?\s?\d+|\bcontainers?\b|\bbox(es)?\b|\bjobs?\b|\bbe\b|\bbl\b|\booc\b|\btrucks?\b|\brail\b|\bclients?\b|\bdetention\b|\bfree ?days?\b|\bports?\b|\bcfs\b|\bicd\b|\bgate\b|\bwhere\b|\bwhich\b|\bhow many\b|\bkitne\b|\bkaha\b|\bany\b|\blist\b|\bstatus\b|\btoday\b|\byesterday\b|\bweek\b|\bmonth\b|\bsure\b|\bagain\b|\bupdates?\b|\bpending\b|\burgent\b|\barriv|\bvessels?\b|\bships?\b/i.test(t)
}
type Ctx = { used: string[]; proposal: Pending | null }
// the last reply came from a change request (it may have asked for a missing detail)
const afterChangeTry = (history: Turn[]) => /\[checked:[^\]]*propose_change/.test(String([...history].reverse().find((t) => t.role === 'model')?.text || ''))
// runs one tool call: notes it for the chat history; a change is only PREPARED
// (checked and kept for the person's YES), never saved here
function useTool(ctx: Ctx, name: string, args: any, data: any, person: Person): unknown {
  ctx.used.push(`${name} ${JSON.stringify(args || {})}`)
  if (name !== CHANGE_TOOL.name) return runTool(name, args || {}, data, person)
  const res = prepareChange(args, data, person)
  if (!res.ok) return { not_done: res.error }
  ctx.proposal = res.pending
  return { waiting_for_yes: res.pending.summary, tell_the_person: 'The bot is now asking them to reply YES. Do not say it is done.' }
}

// ── Groq (OpenAI-style API) ──
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions'
// Preferred order (reasoning models first: they think briefly, fast on Groq).
// Only models Groq really offers today are used: its model list is read once
// per start and kept, so retired models are never tried.
const GROQ_PREFERRED = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'moonshotai/kimi-k2-instruct-0905', 'qwen/qwen3-32b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct']
let groqAvailable: Set<string> | null = null
let groqLastGood: string | null = null
async function groqModels(key: string): Promise<string[]> {
  if (!groqAvailable) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
      const ids = ((await res.json())?.data || []).map((m: any) => String(m.id))
      if (ids.length) {
        groqAvailable = new Set(ids)
        console.log(`[wa-bot] Groq models available: ${ids.filter((id: string) => !/whisper|tts|guard|playai|orpheus|compound/i.test(id)).join(', ')}`)
      }
    } catch { /* fall back to the preferred list */ }
  }
  const wanted = [Deno.env.get('GROQ_MODEL'), groqLastGood, ...GROQ_PREFERRED].filter(Boolean) as string[]
  return [...new Set(wanted)].filter((m) => !groqAvailable || groqAvailable.has(m))
}
// for the test run: which models this Groq key can use
export async function groqInfo() {
  const key = (Deno.env.get('GROQ_API_KEY') || '').trim()
  await groqModels(key)
  return { available: groqAvailable ? [...groqAvailable] : null, will_try: await groqModels(key) }
}
// per-model reasoning settings; the thinking itself is kept out of the reply
const REASONING: Record<string, Record<string, unknown>> = {
  'openai/gpt-oss-120b': { reasoning_effort: 'medium', include_reasoning: false },
  'openai/gpt-oss-20b': { reasoning_effort: 'medium', include_reasoning: false },
  'qwen/qwen3-32b': { reasoning_format: 'hidden' },
  'qwen/qwen3.8-27b': { reasoning_format: 'hidden' },
}
const noExtras = new Set<string>() // models that refused those settings
const stripThinking = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
// the tool list in plain JSON-schema form (Gemini writes types in capitals)
const lowerTypes = (s: any): any => (Array.isArray(s) ? s.map(lowerTypes) : s && typeof s === 'object'
  ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : lowerTypes(v)])) : s)
const GROQ_TOOLS = TOOLS.map((t: any) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: lowerTypes(t.parameters) } }))

// a service that refused (401/402/403) is skipped for an hour
const refusedUntil: Record<string, number> = {}
const refusedWhy: Record<string, string> = {}
// Services that speak the OpenAI-style chat API (same code for both)
type Provider = { label: string; url: string; keyName: string; models: (key: string) => Promise<string[]>; timeoutMs: number }
const GROQ: Provider = { label: 'groq', url: GROQ_API, keyName: 'GROQ_API_KEY', models: groqModels, timeoutMs: 30_000 }
// OpenCode (opencode.ai): DeepSeek V4.1 Flash, free for now. Key in the Supabase
// secret OPENCODE_API_KEY (made by Jose in the OpenCode console, never in chat).
// Kept short on time so Groq still gets its turn when OpenCode is slow.
const OPENCODE: Provider = {
  label: 'opencode',
  url: (Deno.env.get('OPENCODE_URL') || 'https://opencode.ai/inference/openai/v1/chat/completions').trim(),
  keyName: 'OPENCODE_API_KEY',
  // free models first (DeepSeek as Jose asked); OPENCODE_MODEL picks one by hand
  models: async () => (Deno.env.get('OPENCODE_MODEL') ? [Deno.env.get('OPENCODE_MODEL')!.trim()] : ['deepseek-v4.1-flash-free', 'glm-5.3-flash-free', 'nemotron-3-ultra-free', 'minimax-m3.1-flash-free', 'nemotron-3.5-lightning-free']),
  timeoutMs: 20_000,
}

async function askCompat(p: Provider, question: string, history: Turn[], data: unknown, person: Person, ctx: Ctx): Promise<{ text: string | null; note: string }> {
  const key = (Deno.env.get(p.keyName) || '').trim()
  if (!key) return { text: null, note: `no ${p.keyName}` }
  // refused us recently (wrong key, not allowed, no credits): don't ask again for a while
  if ((refusedUntil[p.label] || 0) > Date.now()) return { text: null, note: `${p.label} skipped (${refusedWhy[p.label]})` }
  const messages: any[] = [
    { role: 'system', content: `${SYSTEM_PROMPT(person)}\n\n${TODAY_BRIEF(data, person)}` },
    ...history.slice(-8).map((t) => ({ role: t.role === 'model' ? 'assistant' : 'user', content: t.text })),
    { role: 'user', content: question },
  ]
  let mustCheck = needsData(question) || afterChangeTry(history)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), p.timeoutMs)
  const tried: string[] = []
  // the free plan allows 8,000 tokens a minute PER MODEL: when one model is full,
  // the next one carries on with the same conversation (tool answers kept); if
  // all are full and Groq says "try again in a few seconds", wait once and retry
  const convo = [...messages]
  let rounds = 0
  let wait = Infinity
  try {
   for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      if (wait > 9_000) break
      await new Promise((r) => setTimeout(r, wait + 300))
    }
    wait = Infinity
    for (const model of await p.models(key)) {
      let skip = false
      while (rounds <= MAX_TOOL_ROUNDS) {
        const res = await fetch(p.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: convo, tools: GROQ_TOOLS, tool_choice: rounds === 0 && mustCheck ? 'required' : 'auto', temperature: 0.3, max_tokens: 1800, ...(noExtras.has(model) ? {} : REASONING[model] || {}) }),
          signal: controller.signal,
        })
        const out = await res.json().catch(() => ({}))
        // "must check the portal" but the model had nothing to look up: ask again, free to answer
        if (res.status === 400 && /tool choice is required/i.test(out?.error?.message || '')) { mustCheck = false; continue }
        if (res.status === 400 && REASONING[model] && !noExtras.has(model) && !/model/i.test(out?.error?.message || '')) {
          // the reasoning settings were refused: ask again without them, and remember
          console.warn(`[wa-bot] ${model} refused the reasoning settings (${String(out?.error?.message || '').slice(0, 140)})`)
          noExtras.add(model)
          continue
        }
        if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 404 || res.status === 429 || res.status >= 500 || (res.status === 400 && /model/i.test(out?.error?.message || ''))) {
          const m = String(out?.error?.message || (typeof out?.error === 'string' ? out.error : '') || out?.message || JSON.stringify(out).slice(0, 200))
          // a refusal that is about the account (not this one model) stops the whole service for an hour
          if ([401, 402, 403].includes(res.status) && (p.label !== 'opencode' || tried.length >= 4)) { refusedUntil[p.label] = Date.now() + (/free tier can only be used/i.test(m) ? 24 * 60 : 60) * 60_000; refusedWhy[p.label] = `${res.status}: ${m.slice(0, 120)}` }
          if (res.status === 429) {
            const t = m.match(/try again in (?:(\d+)m)?([\d.]+)(ms|s)/)
            if (t) wait = Math.min(wait, (Number(t[1] || 0) * 60 + Number(t[2]) / (t[3] === 'ms' ? 1000 : 1)) * 1000)
          }
          tried.push(`${model}: ${res.status}${res.status === 429 ? ` ${m.match(/on (\w+ per \w+[^:]*): Limit \d+/)?.[0] || ''}` : [400, 401, 402, 403].includes(res.status) ? ` (${m.slice(0, 200)})` : ''}`); skip = true; break
        }
        if (!res.ok) return { text: null, note: `${p.label} ${res.status}: ${String(out?.error?.message || '').slice(0, 120)}` }
        const msg = out?.choices?.[0]?.message || {}
        const calls: any[] = msg.tool_calls || []
        if (!calls.length) {
          const text = stripThinking(String(msg.content || ''))
          if (!text) { tried.push(`${model}: empty answer`); skip = true; break } // try the next model
          if (p === GROQ) groqLastGood = model
          return text ? { text, note: `${p.label} ${model}, ${rounds} tool round(s)${tried.length ? ` (skipped ${tried.join(", ")})` : ""}${pass ? ' after a short wait' : ''}` } : { text: null, note: `${p.label} empty answer` }
        }
        convo.push({ role: 'assistant', content: stripThinking(String(msg.content || '')), tool_calls: calls })
        for (const c of calls) {
          let result: unknown
          try { result = useTool(ctx, c.function?.name, JSON.parse(c.function?.arguments || '{}'), data, person) } catch (e) { result = { error: (e as Error).message } }
          convo.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result).slice(0, 9000) })
        }
        rounds++
      }
      if (!skip) return { text: null, note: `${p.label} too many tool rounds` }
    }
   }
    return { text: null, note: `all ${p.label} models busy (${tried.join(', ')})` }
  } catch (e) {
    return { text: null, note: (e as Error).name === 'AbortError' ? `${p.label} timed out` : (e as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

async function askGemini(question: string, history: Turn[], data: unknown, person: Person, ctx: Ctx): Promise<{ text: string | null; note: string }> {
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
        const force = rounds === 0 && (needsData(question) || afterChangeTry(history)) ? { toolConfig: { functionCallingConfig: { mode: 'ANY' } } } : {}
        // each model gets its own time: a slow model must not use up the lighter one's turn
        let reply: { status: number; out: any }
        try {
          reply = await callGemini(model, { ...base, ...force, generationConfig: config, contents: convo }, key, AbortSignal.any([controller.signal, AbortSignal.timeout(PER_MODEL_MS)]))
        } catch (e) {
          if ((e as Error).name !== 'TimeoutError' || controller.signal.aborted) throw e
          tried.push(`${model}: too slow`); skip = true; break
        }
        const { status, out } = reply
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
            try { result = useTool(ctx, p.functionCall.name, p.functionCall.args || {}, data, person) } catch (e) { result = { error: (e as Error).message } }
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
