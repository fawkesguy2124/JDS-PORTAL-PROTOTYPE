// The WhatsApp bot's test set, run before every deploy (scripts/deploy-bot.sh). Jose, 2 Nov
// 2026: "once they rely on the bot … that reliability must be there, for any scenario".
//   1. fixed checks: Hindi / Hinglish / English answers, yes / no, Hindi script, spoken
//      numbers, each with the answer it must give (no private data)
//   2. a snapshot of real papers and group-chat posts, kept OUTSIDE the code in a private
//      folder (default: Desktop\JDS\BOT TESTS): every paper must read and every post must be
//      understood exactly as last time, or the deploy stops
// Nothing is saved anywhere and nothing is sent.
//   npx deno@2 run --allow-read --allow-write --allow-net --allow-env scripts/bot-check.ts [--update] [folder]
// --update: take the current readings as the new snapshot (after checking the changes by eye)
import { answerQuestion } from '../supabase/functions/wa-bot/questions.ts'
import { isYes, isNo, isYesSaid, isNoSaid, prepareChange } from '../supabase/functions/wa-bot/actions.ts'
import { toRoman, normalizeSpoken, jobNoFromText } from '../supabase/functions/wa-bot/media.ts'
import { readDocFile } from '../supabase/functions/wa-bot/docfill.ts'
import { readPost } from '../supabase/functions/_shared/portal/postReader.js'
import { isHinglish } from '../supabase/functions/wa-bot/assistant.ts'
import { isUndo, handlePost } from '../supabase/functions/wa-bot/posts.ts'

const args = Deno.args.filter((a) => !a.startsWith('--'))
const UPDATE = Deno.args.includes('--update')
const FOLDER = args[0] || 'C:/Users/iwinj/OneDrive/Desktop/JDS/BOT TESTS'
let failed = 0
const fail = (what: string) => { failed++; console.log(`  ✗ ${what}`) }

// ── 1. fixed checks ──
console.log('1. Fixed checks')
const said = (t: string) => { const s = toRoman(t); return isYes(s) || isYesSaid(s) ? 'yes' : isNo(s) || isNoSaid(s) ? 'no' : 'other' }
const YESNO: [string, string][] = [
  ['yes', 'yes'], ['Yes, please go ahead.', 'yes'], ['haan add karo', 'yes'], ['haanji', 'yes'], ['bilkul', 'yes'], ['theek hai', 'yes'], ['ठीक है', 'yes'],
  ['हाँ जी, कर दीजिए', 'yes'], ['चलेगा', 'yes'], ['ok', 'yes'],
  ['no', 'no'], ['nahi rehne do', 'no'], ['नहीं, रहने दो', 'no'], ['mat karo', 'no'], ['ruko, galat job hai', 'no'], ['cancel', 'no'],
  ['ok thanks', 'other'], ['shukriya', 'other'], ['yes but not the goods', 'other'], ['J-652 ka ETA kya hai?', 'other'], ['what is the ETA of J-674', 'other'],
]
for (const [t, want] of YESNO) if (said(t) !== want) fail(`"${t}" read as ${said(t)}, should be ${want}`)

const SCRIPT: [string, string][] = [
  ['पता नहीं', 'pata nahin'], ['अभी नहीं', 'abhi nahin'], ['ट्रक से जाएगा', 'trak se jaega'], ['गाड़ी निकल गई', 'gari nikal gai'], ['जॉब ६८९', 'J-689'],
]
for (const [t, want] of SCRIPT) { const got = normalizeSpoken(toRoman(t)); if (got !== want) fail(`"${t}" → "${got}", should be "${want}"`) }
const SPOKEN: [string, string][] = [['job six five two', 'J-652'], ['M H four six C S six zero zero one', 'MH46CS6001'], ['C C L U 7 8 8 5 8 7 4', 'CCLU7885874']]
for (const [t, want] of SPOKEN) { const got = normalizeSpoken(t); if (!got.includes(want)) fail(`spoken "${t}" → "${got}", should contain ${want}`) }
// the reply's language: English in, English out; Hindi / Hinglish in, Hinglish out
const LANG: [string, boolean][] = [
  ['J-689 ka kya status hai?', true], ['portal ka link bhejo', true], [toRoman('J-736 का BE नंबर क्या है?'), true], ['container kahan hai abhi?', true],
  ['what is the ETA of J-674', false], ['how do I add a truck', false], ['job 689', false], ['can you do it now', false], ['ok thanks', false],
]
for (const [t, want] of LANG) if (isHinglish(t) !== want) fail(`"${t}" read as ${isHinglish(t) ? 'Hinglish' : 'English'}`)
// changes the bot prepares (found in the live test of 2 Nov 2026): the mode, container numbers
const DATA = { jobs: [{ id: 'x', job_no: 'J-9901', client: 'Test', mode: 'Sea FCL', port_code: 'INNSA1', containers: 'CCLU7885874', field_meta: {} }], documents: [] }
const ME = { id: 'p', name: 'Test', role: 'admin', phone: '91', level: 'admin' }
const CHANGES: [Record<string, unknown>, RegExp | null][] = [
  [{ action: 'set_mode', job: 'J-9901', job_mode: 'Sea LCL' }, /Sea LCL/], [{ action: 'set_mode', job: 'J-9901', job_mode: 'LCL' }, /Sea LCL/],
  [{ action: 'set_mode', job: 'J-9901', job_mode: 'Air' }, /Air.*INBOM4/], [{ action: 'set_mode', job: 'J-9901', job_mode: 'Sea FCL' }, null],
  [{ action: 'add_container', job: 'J-9901', container: 'TEST1234567' }, null], [{ action: 'add_container', job: 'J-9901', container: 'OOCU9074031' }, /OOCU9074031/],
  [{ action: 'create_job', job: 'J-9902', client: 'Test', job_mode: 'Sea FCL', containers: 'TEST1234567' }, null],
  [{ action: 'create_job', job: 'J-9902', client: 'Test', job_mode: 'Sea FCL', containers: 'OOCU9074031' }, /Create \*J-9902\*/],
]
CHANGES.push([{ action: 'set_vessel', job: 'J-9901', vessel: 'MSC ANNA', voyage: '512W' }, /MSC ANNA \/ 512W/])
// undo, or a change? (live test 2 Nov 2026: "mode wapas FCL kar do" was taken as undo)
const UNDO: [string, boolean][] = [
  ['undo', true], ['undo kar do', true], ['J-9902 wala post undo kar do', true], ['galat hai, wapas karo', true], ['hata do', true], ['that is wrong', true],
  ['J-9903 ka mode wapas FCL kar do', false], ['truck galat hai hata do', false], ['ETA wapas 5 Nov kar do', false], ['MH46AR2016 galat hai', false],
]
for (const [t, want] of UNDO) if (isUndo(t) !== want) fail(`"${t}" read as ${isUndo(t) ? 'undo' : 'not undo'}`)
// a BE typed in a sentence is not saved as a post; a future BE date is never saved
{
  const one = await handlePost({} as any, ME as any, 'J-598 ka BE 1234567 dated 15.10.2026', DATA)
  if (one !== null) fail(`a BE in a sentence was handled as a post: ${one?.reply}`)
  const future = await handlePost({} as any, ME as any, 'J-598 PCM\nBE 1234567/15.12.2026\nGr.5\nRMS\n\nPrior', DATA)
  if (!future || future.saved || !/future/.test(future.reply)) fail(`a future BE date: ${future?.reply}`)
}
for (const [a, want] of CHANGES) {
  const r: any = prepareChange(a, DATA, ME as any)
  if (want ? !(r.ok && want.test(r.pending.summary)) : r.ok) fail(`change ${JSON.stringify(a)} → ${r.ok ? r.pending.summary : r.error}`)
}
const NAMES: [string, string | null][] = [['Processed_BE_736_20261030_2022.pdf', 'J-736'], ['Out of Charge_1004_20260411_0746.pdf', 'J-1004'], ['J-00117 Green Soul Docs.pdf', 'J-117'], ['AWSSE260900057.pdf', null]]
for (const [n, want] of NAMES) if (jobNoFromText(n) !== want) fail(`file "${n}" → ${jobNoFromText(n)}, should be ${want}`)

// answers to the bot's own questions (a fake table: nothing is saved)
const now = new Date().toISOString()
const Q = {
  duty: { key: 'a:duty', job_id: 'a', job_no: 'J-689', kind: 'duty', phone: '91', status: 'open', last_asked_at: now },
  move: { key: 'b:move', job_id: 'b', job_no: 'J-599', kind: 'move', phone: '91', status: 'open', last_asked_at: now },
  delivered: { key: 'c:delivered', job_id: 'c', job_no: 'J-583', kind: 'delivered', phone: '91', status: 'open', last_asked_at: now },
}
const ALL = Object.values(Q)
const fakeAdmin = (rows: any[]) => ({
  from() {
    const f: Record<string, unknown> = {}
    let single = false
    const q: any = {
      select: () => q, gte: () => q, order: () => q, limit: () => q, in: () => q, update: () => q,
      eq: (c: string, v: unknown) => { f[c] = v; return q }, maybeSingle: () => { single = true; return q },
      then: (res: any) => { const hit = rows.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)); return res({ data: single ? hit[0] || null : hit }) },
    }
    return q
  },
})
const deps = { markDelivered: async (_: string, j: string) => `✅ delivered ${j}`, change: async (a: any) => `✅ ${a.action}:${a.mode || a.by || a.stage}` }
const ANSWERS: [string, any[], RegExp | null][] = [
  ['Q|a:duty|yes', ALL, /duty is paid/], ['Q|a:duty|later', ALL, /ask again tomorrow/], ['Q|b:move|rail', ALL, /Rail it is/], ['Q|b:move|client', ALL, /client collects/],
  ['Q|c:delivered|yes', ALL, /delivered J-583/], ['haan J-689 ka duty bhar diya', ALL, /duty is paid/], ['हाँ, J-689 की ड्यूटी भर दी', ALL, /duty is paid/],
  ['J-599 ट्रक से जाएगा', ALL, /Truck it is/], ['599 rail se jayega', ALL, /Rail it is/], ['J-599 party khud le jayegi', ALL, /client collects/],
  ['पता नहीं', [Q.duty], /won't ask/], ['अभी नहीं', [Q.duty], /ask again tomorrow/], ['abhi tak nahi hua', [Q.duty], /ask again tomorrow/],
  ['डिलीवर हो गया', [Q.delivered], /delivered J-583/], ['what is the ETA of J-674?', ALL, null], ['ok thanks', ALL, null],
]
for (const [t, rows, want] of ANSWERS) {
  const r = await answerQuestion(fakeAdmin(rows), { phone: '91', name: 'Test' }, toRoman(t), {}, deps)
  const got = r?.reply || null
  if (want ? !(got && want.test(got)) : got !== null) fail(`answer "${t}" → ${got ?? '(to the assistant)'}`)
}
console.log(failed ? `  ${failed} wrong` : '  all right')

// ── 2. the snapshot of real papers and posts ──
console.log('2. Real papers and group-chat posts')
const snapFile = `${FOLDER}/snapshot.json`
let exists = true
try { Deno.statSync(FOLDER) } catch { exists = false }
if (!exists) {
  console.log(`  (private test folder not found: ${FOLDER}; only the fixed checks ran)`)
} else {
  const now: Record<string, unknown> = {}
  // papers: what the reader finds in each PDF
  const papers = [...Deno.readDirSync(`${FOLDER}/papers`)].filter((e) => e.isFile && /\.pdf$/i.test(e.name)).map((e) => e.name).sort()
  for (const name of papers) {
    const r = await readDocFile(await Deno.readFile(`${FOLDER}/papers/${name}`)).catch((e) => ({ error: (e as Error).message }))
    now[`paper:${name}`] = r && !('error' in r) ? { types: r.types, found: r.found, be: r.be ? { no: r.be.be_no, date: r.be.be_date, igm: r.be.igm_no } : null, fields: r.fields } : r
  }
  // posts: every message of the group chat, as the post reader understands it
  const lines = Deno.readTextFileSync(`${FOLDER}/JD Group chat.txt`).split(/\r?\n/)
  const HEAD = /^\u200e?\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),? ([^\]]+)\] ([^:]+): (.*)$/
  const msgs: { date: string; text: string }[] = []
  for (const l of lines) {
    const m = l.match(HEAD)
    if (m) msgs.push({ date: `20${m[3].slice(-2)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, text: m[6] })
    else if (msgs.length) msgs[msgs.length - 1].text += `\n${l}`
  }
  let posts = 0
  msgs.forEach((m, i) => {
    const text = m.text.replace(/\u200e/g, '')
    if (/deleted this message|^\s*<attached:[^>]*>\s*$/.test(text)) return
    const r: any = readPost(text, { postDate: m.date })
    if (!r) return
    posts++
    now[`post:${i}`] = r
  })
  console.log(`  ${papers.length} papers, ${posts} posts read`)
  if (UPDATE) {
    Deno.writeTextFileSync(snapFile, JSON.stringify(now))
    console.log(`  snapshot saved (${Object.keys(now).length} readings)`)
  } else {
    let before: Record<string, unknown> = {}
    try { before = JSON.parse(Deno.readTextFileSync(snapFile)) } catch { console.log('  no snapshot yet: run with --update once'); failed++ }
    const keys = [...new Set([...Object.keys(before), ...Object.keys(now)])]
    const diffs = keys.filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(now[k] ?? null))
    for (const k of diffs.slice(0, 15)) fail(`${k} reads differently now`)
    if (diffs.length > 15) console.log(`  …and ${diffs.length - 15} more`)
    if (!diffs.length && Object.keys(before).length) console.log('  all read exactly as before')
    failed += diffs.length > 15 ? diffs.length - 15 : 0
  }
}

console.log(failed ? `\n✗ ${failed} problem(s): do not deploy` : '\n✓ all checks passed')
Deno.exit(failed ? 1 : 0)
