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
import { answerQuestion, followUpFor } from '../supabase/functions/wa-bot/questions.ts'
import { isYes, isNo, isYesSaid, isNoSaid, isHoldSaid, prepareChange, applyChange, saysNotDelivered } from '../supabase/functions/wa-bot/actions.ts'
import { containerTrip } from '../supabase/functions/_shared/portal/journeyCore.js'
import { happenedToday } from '../supabase/functions/_shared/portal/botMessages.js'
import { toRoman, normalizeSpoken, jobNoFromText, tidyJobNos } from '../supabase/functions/wa-bot/media.ts'
import { readDocFile } from '../supabase/functions/wa-bot/docfill.ts'
import { repairOcrContainers, readScanText } from '../supabase/functions/_shared/portal/docReader.js'
import { readPost } from '../supabase/functions/_shared/portal/postReader.js'
import { isHinglish, changeParts, mergeProposals, LIVE_ASKED } from '../supabase/functions/wa-bot/assistant.ts'
import { isUndo, isCorrection, handlePost } from '../supabase/functions/wa-bot/posts.ts'

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
  // one Hindi word and nothing English (3 Nov 2026)
  ['J-711 ka status', true], ['J-711 kab aayega', true], ['status of J-711', false], ['711 status pls', false],
]
// several changes in one message: split into parts, each with the job no (or not split)
const PARTS: [string, string[]][] = [
  ['J-9903 urgent hai aur free days 25 kar do', ['J-9903 urgent hai', 'J-9903 free days 25 kar do']],
  ['J-9903 ka ETA 5 Nov hai aur line MSC', ['J-9903 ka ETA 5 Nov hai', 'J-9903 line MSC']],
  ['J-9903 rail se jayega aur client deliver karega', ['J-9903 rail se jayega', 'J-9903 client deliver karega']],
  ['set the ETA of J-674 to 5 Nov, priority high', ['set the ETA of J-674 to 5 Nov', 'J-674 priority high']],
  ['J-711 note: client called and BL pending', []], ['J-711 urgent, note: BL pending and client called', ['J-711 urgent', 'J-711 note: BL pending and client called']],
  ['J-652 aur J-667 delivered kar do', []], ['J-9903 ka vessel MSC LUNA hai, voyage 618E', []], ['J-689 ka kya status hai?', []], ['set shipping line of J-9903 to MSC', []],
]
for (const [t, want] of PARTS) { const got = changeParts(t); if (JSON.stringify(got) !== JSON.stringify(want)) fail(`split "${t}" → ${JSON.stringify(got)}`) }
{
  const a: any = { action: 'set_priority', job_id: 'x', job_no: 'J-9903', args: {}, summary: 'Set the priority of J-9903 to urgent', at: '' }
  const b: any = { action: 'set_free_days', job_id: 'x', job_no: 'J-9903', args: {}, summary: 'Set the free days of J-9903 to 25', at: '' }
  const m: any = mergeProposals(mergeProposals(a, b), a)
  if (m.action !== 'batch' || m.args.items.length !== 2) fail(`merging two changes gave ${m.args?.items?.length ?? 1}`)
}
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
// odd values (edge-case hunt 3 Nov 2026): a date that doesn't exist, an ETA far from today (2/11 read
// as 11 Feb), a plate missing a digit; capitals are fine
{
  const day = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)
  CHANGES.push([{ action: 'set_eta', job: 'J-9901', date: '2026-11-31' }, null], [{ action: 'set_eta', job: 'J-9901', date: day(-60) }, null], [{ action: 'set_eta', job: 'J-9901', date: day(200) }, null],
    [{ action: 'set_eta', job: 'J-9901', date: day(5) }, /Set the ETA/], [{ action: 'add_truck', job: 'J-9901', truck_no: 'MH04AB123' }, null], [{ action: 'add_truck', job: 'J-9901', truck_no: 'mh 04 ab 1234' }, /MH04AB1234/],
    [{ action: 'add_truck', job: 'J-9901', truck_no: '22BH1234AB' }, /22BH1234AB/], [{ action: 'set_priority', job: 'J-9901', priority: 'URGENT' }, /urgent/])
}
// undo, or a change? (live test 2 Nov 2026: "mode wapas FCL kar do" was taken as undo)
const UNDO: [string, boolean][] = [
  ['undo', true], ['undo kar do', true], ['J-9902 wala post undo kar do', true], ['galat hai, wapas karo', true], ['hata do', true], ['that is wrong', true],
  ['J-9903 ka mode wapas FCL kar do', false], ['truck galat hai hata do', false], ['ETA wapas 5 Nov kar do', false], ['MH46AR2016 galat hai', false],
]
for (const [t, want] of UNDO) if (isUndo(t) !== want) fail(`"${t}" read as ${isUndo(t) ? 'undo' : 'not undo'}`)
// (code check 3 Nov 2026) loose words about another job, or a sentence, are not an undo of J-711's post
const UNDO711: [string, boolean][] = [['J-712 ka invoice galat hai', false], ['J-711 gaadi wapas aa gayi', false], ['wrong job, it is J-584', true], ['galat hai', true], ['J-711 galat hai', true]]
for (const [t, want] of UNDO711) if (isUndo(t, 'J-711') !== want) fail(`"${t}" after a J-711 post read as ${isUndo(t, 'J-711') ? 'undo' : 'not undo'}`)
// a BE typed in a sentence is not saved as a post; a future BE date is never saved
{
  const one = await handlePost({} as any, ME as any, 'J-598 ka BE 1234567 dated 15.10.2026', DATA)
  if (one !== null) fail(`a BE in a sentence was handled as a post: ${one?.reply}`)
  const future = await handlePost({} as any, ME as any, 'J-598 PCM\nBE 1234567/15.12.2026\nGr.5\nRMS\n\nPrior', DATA)
  if (!future || future.saved || !/future/.test(future.reply)) fail(`a future BE date: ${future?.reply}`)
}
// a removal or correction is never saved as a truck post (code check 3 Nov 2026: saved as a NEW truck)
for (const t of ['J-711 se truck MH04AB1234 hata do', 'remove MH04AB1234 from J-711', 'J-712 ka truck MH04AB1234 nahi, MH04AB1235 hai', 'J-711 truck MH04AB1234 galat hai', 'J-711 MH04AB1234 cancel']) {
  const r = await handlePost({} as any, ME as any, t, DATA)
  if (r !== null) fail(`"${t}" was handled as a post: ${r.reply}`)
}
for (const t of ['J-711 MH04AB1234', 'J-711 PCM\nMH04AB1234\n1x40']) if (isCorrection(t)) fail(`a plain truck post "${t}" read as a correction`)
// a question, a plan, the past or a request is never saved at once as a post (edge-case hunt 3 Nov 2026)
for (const t of ['kal J-711 ka truck MH04AB1234 aayega', 'J-711 MH04AB1234 tomorrow', 'J-711 truck MH04AB1234 will load at 5 pm', 'J-711 MH04AB1234 kitne baje niklega',
  'J-711 kal MH04AB1234 bhejenge', 'J-711 old truck MH04AB1234 tha', 'J-711 MH04AB1234 RTO details', 'J-711 BE 1234567 Gr. 2 RMS kya hai?',
  'J-711 ka BE 1234567 dt 02.11.2026 Gr.5 RMS file karna hai', 'J-711\nBE 1234567/02.11.2026\nGr.5\nRMS\nnot yet filed']) {
  const r = await handlePost({} as any, ME as any, t, DATA)
  if (r !== null) fail(`"${t.replace(/\n/g, ' / ')}" was handled as a post: ${r.reply}`)
}
// the customs stage never goes back once the OOC is in (a late "duty paid" tap)
{
  const d = { jobs: [{ id: 'o', job_no: 'J-689', client: 'V', be_no: '4569416', stage: 7, field_meta: {} }], customsByJob: { o: { be_no: '4569416', ooc_date: '2026-11-02' } }, documents: [] }
  const r: any = prepareChange({ action: 'set_be_stage', job: 'J-689', stage: 'duty_paid' }, d, ME as any)
  if (r.ok) fail(`duty paid after the OOC was accepted: ${r.pending.summary}`)
}
// how a waiting change is answered (code check / probe 3 Nov 2026)
const REPLIES: [string, string][] = [
  ['👍', 'yes'], ['👍🏽', 'yes'], ['✅', 'yes'], ['okk', 'yes'], ['kk', 'yes'], ['yup', 'yes'], ['fine', 'yes'], ['chalo', 'yes'], ['no problem', 'yes'], ['no issues go ahead', 'yes'],
  ['haan ji kar do', 'yes'], ['theek hai', 'yes'], [toRoman('हां कर दो'), 'yes'], ['confirm karo', 'yes'],
  ['ok but date 5 nov', 'neither'], ['yes but truck is MH04AB1234', 'neither'], ['go ahead and also add truck MH46AB1234', 'neither'], ['yes and mark urgent', 'neither'],
  ['theek hai par 2 container hai', 'neither'], ['haan, J-712 pe karo', 'neither'], ['ok thanks', 'neither'], ['yes for 711 no for 689', 'neither'],
  ['nahi', 'no'], ['mat karo', 'no'], ['cancel it', 'no'], ['wait', 'hold'], ['abhi nahi', 'hold'], ['baad me', 'hold'], ['not now', 'hold'], ['let me check', 'hold'], ['confirm karke batata hu', 'hold'],
]
for (const [t, want] of REPLIES) {
  const got = isYesSaid(t) || isYes(t) ? 'yes' : isHoldSaid(t) ? 'hold' : isNoSaid(t) || isNo(t) ? 'no' : 'neither'
  if (got !== want) fail(`reply "${t}" to "Shall I go ahead?" read as ${got}, should be ${want}`)
}
// the group chat's job numbers
for (const [t, want] of [['J. 00711 ka status', 'J-711 ka status'], ['J.00569/VENDEKIN', 'J-569/VENDEKIN'], ['J-0235 IAC', 'J-235 IAC'], ['J-711', 'J-711'], ['MH 04 J 1234', 'MH 04 J 1234']] as [string, string][])
  if (tidyJobNos(t) !== want) fail(`"${t}" tidied to "${tidyJobNos(t)}"`)
for (const [a, want] of CHANGES) {
  const r: any = prepareChange(a, DATA, ME as any)
  if (want ? !(r.ok && want.test(r.pending.summary)) : r.ok) fail(`change ${JSON.stringify(a)} → ${r.ok ? r.pending.summary : r.error}`)
}
const NAMES: [string, string | null][] = [['J. 00583 PCM cfs invoice.pdf', 'J-583'], ['J.00569/VENDEKIN RS.5192.pdf', 'J-569'], ['Processed_BE_736_20261030_2022.pdf', 'J-736'], ['Out of Charge_1004_20260411_0746.pdf', 'J-1004'], ['J-00117 Green Soul Docs.pdf', 'J-117'], ['AWSSE260900057.pdf', null]]
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
  // (the bot has just asked about these jobs)
  const r = await answerQuestion(fakeAdmin(rows), { phone: '91', name: 'Test' }, toRoman(t), {}, deps, rows.map((x) => `*${x.job_no}* ?`).join('\n'))
  const got = r?.reply || null
  if (want ? !(got && want.test(got)) : got !== null) fail(`answer "${t}" → ${got ?? '(to the assistant)'}`)
}
// J-711 (2 Nov 2026): "not delivered" must never become "mark delivered"
const NOTDEL: [string, boolean][] = [
  ['J-711 not delivered. Please change it in portal', true], ['J-711 deliver nahi hua', true], ['abhi tak deliver nahi hua', true], ['still not delivered', true],
  ['not yet delivered', true], ['J-711 delivered', false], ['deliver ho gaya', false], ['is J-711 delivered?', false],
  ['client ko maal nahi mila 711', true], ["didn't get delivered", true], ['delivery pending', true], ['deliver hona baki hai', true], [toRoman('माल डिलीवर नहीं हुआ'), true], ['cargo not reached client', true],
]
for (const [t, want] of NOTDEL) if (saysNotDelivered(t) !== want) fail(`"${t}" read as ${saysNotDelivered(t) ? 'NOT delivered' : 'delivered'}`)
{
  const r: any = await answerQuestion(fakeAdmin([Q.delivered]), { phone: '91', name: 'Test' }, 'not delivered yet', {}, deps, '📦 *J-583*: Is it delivered?')
  if (!r || /delivered J-583/.test(r.reply)) fail(`"not delivered yet" to "Is it delivered?" → ${r?.reply}`)
}
// an open "J-583 delivered?" question is NEVER answered by talk about something else (code check
// 3 Nov 2026: "J-711 ka OOC ho gaya?" marked J-583 delivered, with no Yes / No)
for (const [t, last] of [['J-711 ka OOC ho gaya?', '📦 *J-583*: Is it delivered?'], ['is J-711 delivered', '📦 *J-583*: Is it delivered?'], ['J-583 delivered?', '📦 *J-583*: Is it delivered?'],
  ['ok', '📦 *J-583*: Is it delivered?'], ['ji', '📦 *J-583*: Is it delivered?'], ['ho gaya', 'Hi Iwin 👋'], ['delivered', '*J-711* (IAC): left the port'], ['kya ho gaya', '📦 *J-583*: Is it delivered?']] as [string, string][]) {
  const r: any = await answerQuestion(fakeAdmin([Q.delivered]), { phone: '91', name: 'Test' }, t, {}, deps, last)
  if (r && /delivered J-583/.test(r.reply)) fail(`"${t}" (after "${last}") marked J-583 delivered`)
}
for (const t of ['haan delivered', 'ho gaya', 'J-583 delivered']) {
  const r: any = await answerQuestion(fakeAdmin([Q.delivered]), { phone: '91', name: 'Test' }, t, {}, deps, '📦 *J-583*: Is it delivered?')
  if (!r || !/delivered J-583/.test(r.reply)) fail(`"${t}" right after "J-583: Is it delivered?" → ${r?.reply ?? '(to the assistant)'}`)
}
{
  const tq = { key: 'd:truck', job_id: 'd', job_no: 'J-583', kind: 'truck', phone: '91', status: 'open', last_asked_at: now }
  const r: any = await answerQuestion(fakeAdmin([tq]), { phone: '91', name: 'Test' }, 'J-711 MH04AB1234', {}, deps, '🚚 *J-583*: truck number?')
  if (r) fail(`a truck for J-711 was taken as the answer to J-583's truck question: ${r.reply}`)
}
// a YES never overwrites a change someone made after the question (code check 3 Nov 2026)
{
  const later = new Date().toISOString(), earlier = new Date(Date.now() - 60_000).toISOString()
  const job = { id: 'x', job_no: 'J-9901', client: 'Test', updated_at: later, field_meta: {} }
  const p: any = { action: 'set_priority', job_id: 'x', job_no: 'J-9901', args: { priority: 'urgent' }, summary: 'x', at: earlier, seen: earlier }
  const r1 = await applyChange(fakeAdmin([job]) as any, p, ME as any)
  if (!/changed by someone else/.test(r1)) fail(`a YES after someone else's change → ${r1}`)
  const r2 = await applyChange(fakeAdmin([job]) as any, { action: 'batch', job_id: 'x', job_no: 'J-9901', args: { items: [p, p] }, summary: 'x', at: earlier } as any, ME as any)
  if (!/changed by someone else/.test(r2)) fail(`a YES to two changes after someone else's change → ${r2}`)
}
// Port Out is the way to the CFS: never "left with cargo" (so never OOC done or delivered) from
// a port "DPD" event; only a job JDS mark DPD, or a Port Out weeks old with nothing after it
{
  const day = (d: number) => new Date(Date.now() - d * 864e5).toISOString()
  const box = (outDaysAgo: number) => ({ container_no: 'DFSU7478382', milestones: [
    { description: 'DPD', date: day(outDaysAgo + 3) }, { description: 'PORT IN', date: day(outDaysAgo + 2) }, { description: 'PORT OUT', date: day(outDaysAgo) }] })
  const job = (fm = {}) => ({ id: 'j', job_no: 'J-711', eta: day(5).slice(0, 10), stage: 4, field_meta: fm })
  const t1 = containerTrip(box(1), job()); if (t1.exitAt || t1.dpd || !t1.toCfsSince) fail(`a day-old Port Out with a port DPD event → ${JSON.stringify(t1)}`)
  const t2 = containerTrip(box(1), job({ dpd: true })); if (!t2.exitAt) fail('a job JDS marked DPD did not leave at Port Out')
  const old = { container_no: 'X', milestones: [{ description: 'PORT IN', date: day(40) }, { description: 'PORT OUT', date: day(30) }] }
  const t3 = containerTrip(old, { id: 'j', job_no: 'J-1', eta: day(42).slice(0, 10), stage: 7 }); if (!t3.exitAt) fail('a 30-day-old Port Out with nothing after it is still open')
}
// asking at the right moment: the follow-up after a question about one job (J-711, 2 Nov 2026)
{
  const day = (d: number) => new Date(Date.now() - d * 864e5).toISOString()
  const row = { container_no: 'DFSU7478382', milestones: [{ description: 'PORT IN', date: day(3) }, { description: 'PORT OUT', date: day(1) }] }
  const mk = (fm: any, stage = 4) => ({ id: 'j711', job_no: 'J-711', client: 'IAC', mode: 'Sea FCL', containers: 'DFSU7478382', be_no: '4818626', be_date: day(0).slice(0, 10), eta: day(4).slice(0, 10), stage, field_meta: fm, trucks: [] })
  const data = (job: any) => ({ jobs: [job], customsByJob: {}, resultsByJob: {}, containersByNo: { DFSU7478382: row } })
  const a = followUpFor(mk({ delivery_by: 'client' }), data(mk({ delivery_by: 'client' })), 'where is J-711 now?')
  if (!a || a.key !== 'j711:deliver_cfs') fail(`J-711 "client collects" but going to the CFS → ${a?.key || 'no question'}`)
  const b = followUpFor(mk({}), data(mk({})), 'J-711 status?')
  if (!b || b.key !== 'j711:deliver') fail(`J-711 with nobody set → ${b?.key || 'no question'}`)
  const c = followUpFor(mk({ delivery_by: 'jds' }, 10), data(mk({ delivery_by: 'jds' }, 10)), 'J-711?')
  if (c) fail(`a delivered job got a follow-up: ${c.key}`)
  const dq = { key: 'j711:deliver', job_id: 'j711', job_no: 'J-711', kind: 'deliver', phone: '91', status: 'open', last_asked_at: new Date().toISOString() }
  for (const [t, want] of [['Q|j711:deliver|jds', /JDS delivers/], ['hum le jayenge', /JDS delivers/], ['party khud le jayegi', /client collects/]] as [string, RegExp][]) {
    const r: any = await answerQuestion(fakeAdmin([dq]), { phone: '91', name: 'Test' }, t, {}, deps, '*J-711* (IAC): Who takes the cargo out?')
    if (!r || !want.test(r.reply)) fail(`"${t}" to "who takes it out?" → ${r?.reply}`)
  }
}
// WhatsApp alerts: only what happened today
if (!happenedToday(new Date().toISOString()) || happenedToday(new Date(Date.now() - 2 * 864e5).toISOString()) || !happenedToday(null)) fail('happenedToday is wrong')
{
  const r: any = prepareChange({ action: 'mark_not_delivered', job: 'J-9901' }, { jobs: [{ id: 'x', job_no: 'J-9901', client: 'Test', stage: 10, field_meta: {} }], documents: [] }, ME as any)
  if (!r.ok || !/not delivered/.test(r.pending.summary)) fail(`mark_not_delivered → ${r.ok ? r.pending.summary : r.error}`)
}
// the live test of 3 Nov 2026 (harder round)
{
  // an ETA given as "eta" (the AI's choice) is not lost
  const r: any = prepareChange({ action: 'set_eta', job: 'J-9901', eta: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) }, DATA, ME as any)
  if (!r.ok) fail(`set_eta with "eta" → ${r.error}`)
  // only an explicit ask spends a ULIP call
  for (const [t, want] of [['J-689 OOC hua kya?', false], ['j 711 ka sttaus btao', false], ['where is J-711 container', false], ['check customs J-689', true], ['J-689 customs abhi check karo', true], ['refresh J-711', true], ['pata karo J-689 OOC aaya kya', true]] as [string, boolean][])
    if (LIVE_ASKED.test(t) !== want) fail(`"${t}" ${want ? 'should' : 'should not'} start a live check`)
  // delivered needs the OOC; never "all jobs" at once
  const d = { jobs: [{ id: 'a', job_no: 'J-673', client: 'L', stage: 2, be_no: null, field_meta: {} }, { id: 'b', job_no: 'J-689', client: 'V', stage: 7, be_no: '4569416', field_meta: {} }], customsByJob: {}, documents: [] }
  const r1: any = prepareChange({ action: 'mark_delivered', job: 'J-673' }, d, ME as any)
  if (r1.ok) fail('a job with no OOC (ship at sea) could be marked delivered')
  const r2: any = prepareChange({ action: 'mark_delivered', job: 'J-689' }, d, ME as any)
  if (!r2.ok) fail(`a job with its OOC could not be marked delivered: ${r2.error}`)
  const r3: any = prepareChange({ action: 'mark_delivered', jobs: ['J-1', 'J-2', 'J-3', 'J-4', 'J-5', 'J-6', 'J-7'] }, d, ME as any)
  if (r3.ok) fail('"mark all jobs delivered" (7 jobs) was proposed')
  // a long message is never split into changes
  if (changeParts(`${'bhai aaj bahut kaam hai, client ne call kiya aur bola ki maal jaldi chahiye, '.repeat(4)} J-9904 urgent kar do aur note likh do`).length) fail('a long message was split into changes')
  // the bot's own question is not answered by a question, a long sentence, another job's BE
  const beQ = { key: 'e:be', job_id: 'e', job_no: 'J-598', kind: 'be', phone: '91', status: 'open', last_asked_at: now }
  const bd = { jobs: [{ id: 'f', job_no: 'J-689', be_no: '4569416' }, { id: 'e', job_no: 'J-598', be_no: null }] }
  for (const t of ['kal kaunsa ship aa raha hai', 'BE 4569416', 'J-711 delivered hai kya', 'ok', 'container abhi nahi pata, baad me dunga. job bana do']) {
    const r: any = await answerQuestion(fakeAdmin([beQ]), { phone: '91', name: 'Test' }, t, bd, deps, '📄 *J-598*: no BE in the portal yet. Is it filed?')
    if (r) fail(`"${t}" was taken as the answer to J-598's BE question: ${r.reply}`)
  }
  const old = { ...beQ, last_asked_at: new Date(Date.now() - 8 * 36e5).toISOString() }
  const r4: any = await answerQuestion(fakeAdmin([old]), { phone: '91', name: 'Test' }, 'kal', bd, deps, '📄 *J-598*: no BE in the portal yet. Is it filed?')
  if (r4) fail(`"kal" 8 hours after the question was taken as its answer: ${r4.reply}`)
}
// a new job with a BL or container already on an open job says so in its question (5 Nov 2026)
{
  const d = { jobs: [{ id: 'a', job_no: 'J-741', client: 'L', stage: 2, bl_no: 'MIAO261000085', containers: 'OOCU9074031', field_meta: {} }, { id: 'b', job_no: 'J-100', client: 'L', stage: 10, bl_no: 'XYZA1234567', containers: 'CCLU7885874', field_meta: {} }], documents: [] }
  const make = (a: any) => prepareChange({ action: 'create_job', job: 'J-1236', client: 'L', job_mode: 'Sea FCL', ...a }, d, ME as any) as any
  if (!/already on J-741/.test(make({ containers: 'OOCU9074031' }).pending?.summary)) fail('a repeated container on a new job was not said')
  if (!/already on J-741/.test(make({ containers: 'CCLU7885874', bl_no: 'MIAO261000085' }).pending?.summary)) fail('a repeated BL on a new job was not said')
  if (/already on/.test(make({ containers: 'CCLU7885874' }).pending?.summary)) fail('a container on a delivered job (a later trip) was called a repeat')
}
// a scanned BL read by OCR (5 Nov 2026): misread container numbers are repaired only when the
// check digit proves it; a paper with no real number gives no container
for (const [raw, want] of [['TCNU7392038', 'TCNU7392038'], ['TCNU 739203 8', 'TCNU7392038'], ['TCNU739203B', 'TCNU7392038'], ['TCNU7392O38', 'TCNU7392038'], ['TCNV7392038', 'TCNU7392038'], ['TCNU7392039', 'TCNU7392039'], ['INVOICE 12345', 'INVOICE 12345'], ['EGEU1074180', 'EGSU1074180'], ['ITAAU1814407', 'ITAAU1814407']] as [string, string][])
  if (repairOcrContainers(raw) !== want) fail(`OCR container "${raw}" → "${repairOcrContainers(raw)}", should be "${want}"`)
{
  const scan = 'BILL OF LADING\nB/L No: ZIMUABC1234567\nOCEAN VESSEL SYNERGY OAKLAND\nVOY 27W\nTCNU739203B\nPORT OF DISCHARGE NHAVA SHEVA'
  const r: any = readScanText(scan)
  if (r.documents[0].type !== 'bl' || !r.fields.container_numbers?.includes('TCNU7392038')) fail(`a scanned BL was not read: ${JSON.stringify(r.fields).slice(0, 120)}`)
  // the real scan of J-644: small print between the label and the ship, a misread container
  const j644: any = readScanText('Ocean vessel Port of loading below have been signed, one of which\nto be void.\nITAL USODIMARE V.191W NANSHA CHINA\nPort of discharge Place of delivery\nNHAVA SHEVA INDIA\nCNTR NO.\nEGEU1074180/EMCGYGTE35\nBILL OF LADING')
  if (j644.fields.vessel_name !== 'ITAL USODIMARE' || j644.fields.voyage_no !== '191W' || !j644.fields.container_numbers?.includes('EGSU1074180') || !j644.fromScan) fail(`the scan of J-644 → ${JSON.stringify(j644.fields).slice(0, 160)}`)
  const junk: any = readScanText('holiday photo with some words on it and nothing else at all here')
  if (junk.documents[0].type === 'bl' || junk.fields.container_numbers?.length) fail('a paper that is not a BL was read as one')
  const fake: any = readScanText('BILL OF LADING\nCONTAINER TCNU7392039\nOCEAN VESSEL X')
  if (fake.fields.container_numbers?.length) fail(`a container with a wrong check digit was accepted: ${fake.fields.container_numbers}`)
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
