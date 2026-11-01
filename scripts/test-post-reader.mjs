// Runs the post reader (supabase/functions/_shared/portal/postReader.js) over a WhatsApp
// chat export and reports what it read: how many BE and truck posts, which fields came
// out, and every post it could not read cleanly, so they can be looked at by eye.
//   node scripts/test-post-reader.mjs "<path to _chat.txt>" [out.json]
// The chat is only read; nothing is saved anywhere except the optional report file.
import { readFileSync, writeFileSync } from 'node:fs'
import { readPost } from '../supabase/functions/_shared/portal/postReader.js'

const [file, outFile] = process.argv.slice(2)
if (!file) { console.error('usage: node scripts/test-post-reader.mjs <_chat.txt> [out.json]'); process.exit(1) }
const lines = readFileSync(file, 'utf8').split(/\r?\n/)
const HEAD = /^‎?\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),? ([^\]]+)\] ([^:]+): (.*)$/
const msgs = []
for (const l of lines) {
  const m = l.match(HEAD)
  if (m) msgs.push({ date: `20${m[3].slice(-2)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, who: m[5].replace(/[ ~]/g, '').trim(), text: m[6] })
  else if (msgs.length) msgs[msgs.length - 1].text += `\n${l}`
}
const clean = (t) => t.replace(/‎/g, '')

const be = [], truck = [], badBe = [], badTruck = []
const looksBe = (t) => /\bBE\b/i.test(t) && /\b\d{7}\b/.test(t) && /\b(RMS|APR|ACL|prior|advance|normal|BG)\b/i.test(t)
const looksTruck = (t) => /\b(MH|GJ|RJ|CG|KA|GA|MP|DL|HR|UP)\s*-?\s*\d{1,2}\s*[A-Z]{0,3}\s*-?\s*\d{3,4}\b/i.test(t)
for (const m of msgs) {
  const text = clean(m.text)
  if (/deleted this message|^\s*<attached:[^>]*>\s*$/.test(text)) continue
  const r = readPost(text, { postDate: m.date })
  if (r?.kind === 'be') {
    be.push({ ...m, r })
    const miss = []
    if (!r.jobs.length) miss.push('job')
    if (!r.be_date) miss.push('date')
    if (!r.group) miss.push('group')
    if (!r.lane) miss.push('lane')
    if (!r.filing) miss.push('filing')
    if (miss.length || r.notes.length) badBe.push({ date: m.date, who: m.who, miss, notes: r.notes, text })
  } else if (r?.kind === 'truck') {
    truck.push({ ...m, r })
    const issues = [...r.problems]
    for (const t of r.trucks) {
      if (!t.boxes.length && t.pkgs == null) issues.push(`${t.plate}: no container or packages`)
      if (!t.mobile) issues.push(`${t.plate}: no driver mobile`)
    }
    if (issues.length) badTruck.push({ date: m.date, who: m.who, issues, trucks: r.trucks, text })
  } else if (looksBe(text) || looksTruck(text)) {
    ;(looksBe(text) ? badBe : badTruck).push({ date: m.date, who: m.who, miss: ['not read at all'], issues: ['not read at all'], text })
  }
}

const count = (arr, f) => arr.filter(f).length
const trucksAll = truck.flatMap((x) => x.r.trucks)
const report = {
  messages: msgs.length,
  be: {
    posts: be.length,
    withJob: count(be, (x) => x.r.jobs.length), withDate: count(be, (x) => x.r.be_date), withGroup: count(be, (x) => x.r.group),
    withLane: count(be, (x) => x.r.lane), withFiling: count(be, (x) => x.r.filing), withBg: count(be, (x) => x.r.bg),
    lanes: Object.fromEntries([...new Set(be.map((x) => x.r.lane))].map((k) => [k, count(be, (x) => x.r.lane === k)])),
    dateNotes: count(be, (x) => x.r.notes.length),
    flagged: badBe.length,
  },
  truck: {
    posts: truck.length, trucks: trucksAll.length,
    withJob: count(trucksAll, (t) => t.jobs.length), withBox: count(trucksAll, (t) => t.boxes.length), withPkgs: count(trucksAll, (t) => t.pkgs != null),
    withNeither: count(trucksAll, (t) => !t.boxes.length && t.pkgs == null), withMobile: count(trucksAll, (t) => t.mobile),
    multiJobTrucks: count(trucksAll, (t) => t.jobs.length > 1), postsWithPending: count(truck, (x) => x.r.pending),
    flagged: badTruck.length,
  },
}
console.log(JSON.stringify(report, null, 2))
if (outFile) writeFileSync(outFile, JSON.stringify({ report, badBe, badTruck, sampleBe: be.slice(0, 5).map((x) => x.r), sampleTruck: truck.filter((x) => x.r.trucks.length > 1).slice(0, 8).map((x) => ({ text: x.text, r: x.r })) }, null, 2))
