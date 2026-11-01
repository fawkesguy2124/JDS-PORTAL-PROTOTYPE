// Reads the two posts the JDS team already writes in the JD Group (Jose, 1 Nov 2026), so a
// post sent or forwarded to the bot fills the portal with no form and no AI:
//
//   BE filed                        Truck out
//   J-00583 PCM                     J. 00183 PCM
//   BE 4588199/22.10.2026           6x40
//   Gr.5, 100% BG                   BEAU5047369
//   RMS                             MH46CU9963
//   Prior                           M. 9004100128
//                                   …
//                                   2X40 PENDING DUE TO TRANSPORTER
//
// Written from the year's real posts (Jan – 1 Nov 2026: ~980 BE posts, ~950 truck posts);
// scripts/test-post-reader.mjs runs it over all of them. Plain code: shared by the bot
// (Deno) and the tests (Node). Nothing here touches the database.

// ── small pieces ──

// job numbers as the team types them: J-00583, J.00240, J. 00240, J-0658, J+00553,
// J.00963/MBPT/PCM, and Adorn's own series ALS-055 / ALS 0012
const JOB_RE = /\b(JD?|ALS)\s*[-.+_/]{0,2}\s*(\d{1,5})\b/gi
export function jobRefsIn(line) {
  const out = []
  // a word stuck to the front ("ReaJ-00465") still leaves the J-0xxxx shape
  const s = String(line || '').replace(/[A-Za-z]+(J[-.]\s?0\d{2,4}\b)/g, ' $1')
  for (const m of s.matchAll(JOB_RE)) {
    const series = m[1].toUpperCase().replace(/^JD$/, 'J') // "Jd-00831" is a slip for J-00831
    const num = Number(m[2])
    // "J" must be followed by a number with at least 2 digits, or a separator ("J 5" is not a job)
    if (series === 'J' && m[2].length < 2) continue
    if (!num) continue
    out.push({ series, num, text: m[0].trim(), jobNo: series === 'J' ? `J-${num}` : `ALS-${String(num).padStart(3, '0')}` })
    // "J-00236 /00237 /00238": one job line naming three jobs
    if (series === 'J') {
      let rest = s.slice(m.index + m[0].length)
      let more
      while ((more = rest.match(/^\s*[/,&]\s*(0\d{2,4}|\d{3,5})\b/))) {
        const n = Number(more[1])
        if (n) out.push({ series, num: n, text: more[1], jobNo: `J-${n}` })
        rest = rest.slice(more[0].length)
      }
    }
  }
  return out
}

// ISO 6346 container number check digit
const ISO_VAL = (() => {
  const v = {}
  let n = 10
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { if (n % 11 === 0) n++; v[c] = n++ }
  for (let d = 0; d <= 9; d++) v[String(d)] = d
  return v
})()
export function containerOk(no) {
  const s = String(no || '').toUpperCase()
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) sum += ISO_VAL[s[i]] * 2 ** i
  return (sum % 11) % 10 === Number(s[10])
}
const BOX_RE = /\b([A-Z]{3}[UJZ])[\s-]?(\d{6,8})\b/gi // also "PCIU-9138080"

// Indian truck plates: MH46CU9963, MH 46 BU 0015, MH04LQ-2755, Mh04LQ2180, CG 07 BU 0205,
// RJ01GB4657, and the BH series 22BH1234AA
const STATES = 'AN|AP|AR|AS|BR|CG|CH|DD|DL|DN|GA|GJ|HP|HR|JH|JK|KA|KL|LA|LD|MH|ML|MN|MP|MZ|NL|OD|OR|PB|PY|RJ|SK|TN|TR|TS|UK|UP|WB'
// (the letters in the middle are required: "SK26007 INVOICE.xlsx" is a file, not a truck)
// (Delhi has up to 4 letters: DL1LAQ9378. The district is kept as written: no 0 is added.)
const PLATE_RE = new RegExp(`\\b(${STATES})[\\s.-]*(\\d{1,2})[\\s.-]*([A-Z]{1,4})[\\s.'-]*(\\d{3,4})\\b|\\b(\\d{2})\\s*BH\\s*(\\d{4})\\s*([A-Z]{1,2})\\b`, 'gi')
// the same shape with a state code that doesn't exist ("NH43Y6962" for MH43Y6962): still a
// truck, written as typed, with a word to check it
const LOOSE_PLATE = /^\W*([A-Z]{2})[\s.-]*(\d{1,2})[\s.-]*([A-Z]{1,3})[\s.'-]*(\d{4})\W*$/i
export function platesIn(line) {
  const out = []
  for (const m of String(line || '').matchAll(PLATE_RE)) {
    const plate = (m[1] ? `${m[1]}${m[2]}${m[3] || ''}${m[4].padStart(4, '0')}` : `${m[5]}BH${m[6]}${m[7]}`).toUpperCase()
    out.push({ plate, at: m.index, end: m.index + m[0].length })
  }
  if (!out.length) {
    const lm = String(line || '').trim().match(LOOSE_PLATE)
    if (lm && !new RegExp(`^(${STATES})$`, 'i').test(lm[1])) {
      const s = String(line || '')
      out.push({ plate: `${lm[1]}${lm[2]}${lm[3]}${lm[4]}`.toUpperCase(), at: 0, end: s.length, unknownState: lm[1].toUpperCase() })
    }
  }
  return out
}

// driver mobile: 10 digits starting 6-9, written with spaces, +91 or a leading 0
function mobilesIn(line, skip = []) {
  let s = String(line || '')
  for (const r of skip) s = s.slice(0, r.at) + ' '.repeat(r.end - r.at) + s.slice(r.end) // not the plate's digits
  const out = []
  // (not part of a longer number: "98602514428" has 11 digits and is no mobile at all)
  for (const m of s.matchAll(/(?<![\d])(?:\+?91[\s-]*|0)?([6-9](?:[\s-]?\d){9})(?![\s-]?\d)/g)) {
    const d = m[1].replace(/\D/g, '')
    if (d.length === 10) out.push(d)
  }
  return out
}

const pkgsIn = (line) => {
  const m = String(line || '').match(/(\d{1,4})\s*(?:no\.?s?\s*)?(?:pkg[sd]?|packages?|pcs|boxes|box|pallets?|plts?|ctns?|cartons?|crates?|bundles?)\b|\b(?:pkgs?|packages?)\s*[.:=-]?\s*(\d{1,4})\b/i)
  return m ? Number(m[1] || m[2]) : null
}

// "2X40 PENDING", "3X40 BALANCE", "1 container pending", "03 MACHINE AND 06 WOODEN BOX PENDING"
function pendingIn(line) {
  const s = String(line || '')
  if (!/\b(pending|balance|baki|remaining)\b/i.test(s)) return null
  if (/\b(empty|revalid)/i.test(s)) return null // empties to return, not cargo still to go
  const sizes = [...s.matchAll(/(\d{1,2})\s*[xX*]\s*(20|40|45)/g)].map((m) => `${Number(m[1])}x${m[2]}`)
  const n = sizes.reduce((t, x) => t + Number(x.split('x')[0]), 0) || Number((s.match(/(\d{1,3})\s*(?:container|cntr|box|truck|vehicle|pkg|package|pallet|plt|ctn|machine)/i) || [])[1]) || null
  return { text: s.trim().replace(/\s+/g, ' ').slice(0, 120), count: n, sizes }
}

// 4.10.26 · 04.10.2026 · 4/10/2026 · 2026-10-04 → '2026-10-04'
function dateOf(d, m, y) {
  let year = Number(y)
  if (String(y).length === 2) year += 2000
  const month = Number(m), day = Number(d)
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ── 1. "BE filed" post ──

const LANES = [
  ['rms', /\bRMS\b/i, 'RMS'], ['apr', /\bAPR\b/i, 'APR'], ['acl', /\bACL\b/i, 'ACL'],
  ['first_check', /\bfirst\s*check\b/i, 'First check'], ['assessed', /\bassessment\s*done\b/i, 'Assessment done'],
  ['query', /\bunder\s*query\b/i, 'Under query'],
]
const FLAGS = [
  ['rodtep', /\bro\s*d\s*tep\b/i, 'RoDTEP'], ['advance_licence', /\badvance\s*licen[cs]e\b|\bAL\b(?=.*licen)/i, 'Advance licence'],
  ['second_hand', /\bsecond\s*hand\b|\bused\s+machine/i, 'Second-hand machine'], ['first_import', /\bfirst\s*(?:time\s*)?import\b/i, 'First import'],
  ['epcg', /\bEPCG\b/i, 'EPCG'],
]

export function readBePost(text, opts = {}) {
  const s = String(text || '')
  const be = s.match(/\bB\s*\/?\s*E\b\s*(?:no\.?|number)?\s*[:.-]?\s*(\d{7})\b(?:\s*[/,-]?\s*(?:dt\.?|date|dated)?\s*[:.-]?\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4}|\d#\d{1,2}|20#\d))?/i)
  if (!be) return null
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const jobs = lines.flatMap((l) => jobRefsIn(l))
  const notes = []
  let date = be[2] ? dateOf(be[2], be[3], be[4]) : null
  if (be[2] && !date) notes.push(`the BE date "${be[2]}.${be[3]}.${be[4]}" can't be read`)
  // the date as typed must make sense: not after the post, not long before it
  const postDay = opts.postDate || null
  if (date && postDay) {
    const diff = (new Date(postDay) - new Date(date)) / 864e5
    if (diff < 0) notes.push(`the BE date ${date} is after the post`)
    else if (diff > 45) notes.push(`the BE date ${date} is ${Math.round(diff)} days before the post (year typed wrong?)`)
  }
  const group = (s.match(/\bGr(?:oup)?\.?\s*[-:]?\s*(\d[A-Z]?)\b/i) || [])[1]?.toUpperCase() || null
  const bg = /\b100\s*%\s*BG\b/i.test(s) ? '100%' : /\bno\s*BG\b/i.test(s) ? 'none' : /\bBG\b/.test(s) ? 'yes' : null
  const lane = LANES.find(([, re]) => re.test(s))
  const filing = (s.match(/\b(prior|advance|normal)\b/i) || [])[1]?.toLowerCase() || null
  const header = lines.find((l) => jobRefsIn(l).length) || lines[0] || ''
  const client = header.replace(JOB_RE, '').replace(/[/,]+/g, ' ').replace(/\s+/g, ' ').trim() || null
  return {
    kind: 'be',
    jobs: [...new Map(jobs.map((j) => [j.jobNo, j])).values()],
    client,
    air: /\bair\b/i.test(header),
    be_no: be[1],
    be_date: date,
    group,
    bg, // 'none' | 'yes' | '100%' | null
    lane: lane ? lane[0] : null,
    lane_label: lane ? lane[2] : null,
    filing, // 'prior' | 'advance' | 'normal' | null
    flags: FLAGS.filter(([, re]) => re.test(s)).map(([id, , label]) => ({ id, label })),
    notes,
  }
}

// ── 2. truck / delivery post ──

export function readTruckPost(text) {
  const raw = String(text || '')
  const lines = raw.split(/\r?\n/)
  // one event per thing found, in the order written
  const ev = []
  const problems = []
  for (const line0 of lines) {
    const line = line0.trim()
    if (!line) { ev.push({ t: 'gap' }); continue }
    const jobs = jobRefsIn(line)
    const plates = platesIn(line.toUpperCase())
    const boxes = [...line.toUpperCase().matchAll(BOX_RE)].map((m) => {
      // a box run into its size ("OOCU69400241(X40)" = OOCU6940024 + 1x40): the first 7
      // digits, when they make a valid number
      const digits = m[2].length > 7 && containerOk(`${m[1]}${m[2].slice(0, 7)}`) ? m[2].slice(0, 7) : m[2]
      return { no: `${m[1]}${digits}`, ok: digits.length === 7 && containerOk(`${m[1]}${digits}`), typed: m[0] }
    })
    const pend = pendingIn(line)
    const pk = pkgsIn(line)
    // "PKG- 2 / 4 / 2" or "Pkg- 08 + 02" for several jobs, by position
    const pkList = (line.match(/\b(?:pkgs?|packages?)\s*[-.:=]?\s*((?:\d{1,4}\s*[/+]\s*)+\d{1,4})\b/i) || [])[1]
    // a note after which the containers listed are NOT on a truck ("PENDING CONTAINER",
    // "off loaded at empty yard")
    const stopNote = /\b(pending|off\s*load|empty\s*yard|revalid|balance)\b/i.test(line) && !plates.length
    if (jobs.length) ev.push({ t: 'job', jobs, pkgs: plates.length ? null : pk, dest: (line.match(/\/\s*(GOA|PUNE|TALOJA|CHAKAN|BHIWANDI|SURAT|NASHIK|NOIDA|FARIDABAD|MUMBAI|RANJANGAON)\b/i) || [])[1] || null })
    for (const b of boxes) ev.push({ t: 'box', ...b })
    for (const p of plates) {
      if (p.unknownState) problems.push(`${p.plate}: "${p.unknownState}" is not a state code, please check the truck number`)
      ev.push({ t: 'plate', plate: p.plate, pkgs: pk, line })
    }
    if (stopNote) ev.push({ t: 'stop' })
    if (pend) ev.push({ t: 'pending', ...pend })
    else if (!jobs.length && !plates.length && pkList) ev.push({ t: 'pkglist', list: pkList.split(/[/+]/).map((x) => Number(x.trim())) })
    else if (!jobs.length && !plates.length && pk) ev.push({ t: 'pkgs', n: pk })
    // a mobile: the first on the line is the driver's ("Mobile.no;-79729…/90964…")
    const mobs = mobilesIn(line, platesIn(line.toUpperCase()))
    if (mobs.length) ev.push({ t: 'mob', no: mobs[0] })
    else if (!boxes.length && !plates.length) {
      const bare = line.replace(/[\s-]/g, '')
      const nine = bare.match(/(?:^|\D)([6-9]\d{8})(?!\d)/)
      const eleven = bare.match(/(?:^|\D)([1-9]\d{10})(?!\d)/)
      if (nine) problems.push(`the mobile ${nine[1]} has 9 digits`)
      else if (eleven && !/^91[6-9]/.test(eleven[1])) problems.push(`the mobile ${eleven[1]} has 11 digits`)
    }
    // sizes: "2X20 AND 8X40" add up; a status line ("ALL 14X40 DONE", empties) is not a size
    if (!pend && !boxes.length && !/\b(all|done|empty|revalid)\b/i.test(line)) for (const sz of line.matchAll(/\b(\d{1,2})\s*[xX*]\s*(20|40|45)\b/g)) ev.push({ t: 'size', n: Number(sz[1]), ft: sz[2] })
  }
  const plates = ev.filter((e) => e.t === 'plate')
  if (!plates.length) return null

  // walk the events: each plate is one truck. Two ways of writing it are in use:
  //   container → truck → mobile (most posts), and truck → mobile → container (Vrn).
  // The order of the post's first container and first truck says which one this is.
  const firstBox = ev.findIndex((e) => e.t === 'box')
  const firstPlate = ev.findIndex((e) => e.t === 'plate')
  const plateFirst = firstBox > firstPlate
  const next = (i) => { for (let k = i + 1; k < ev.length; k++) if (ev[k].t !== 'gap') return ev[k]; return null }
  const trucks = []
  let jobsNow = []
  let inJobs = false // still in the run of job lines (and their PKG lines) above a truck
  let waitBoxes = []
  let waitPkgs = null
  let waitMob = null
  let stopped = false // past a "pending" / "off loaded" note
  const heldBoxes = []
  let last = null
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i]
    if (e.t === 'gap') continue
    if (e.t === 'job') {
      // several job lines in a row (one truck for several LCL jobs) stay together
      if (!inJobs) jobsNow = []
      jobsNow.push(...e.jobs.map((j) => ({ ...j, pkgs: e.jobs.length === 1 ? e.pkgs : null, dest: e.dest })))
      inJobs = true
      continue
    }
    // a PKG line right under a job line is that job's ("J.00058 PCM AIR / PKG.1")
    if (e.t === 'pkgs' && inJobs && jobsNow.length && jobsNow[jobsNow.length - 1].pkgs == null) { jobsNow[jobsNow.length - 1].pkgs = e.n; continue }
    if (e.t === 'pkglist' && inJobs && e.list.length === jobsNow.length) { e.list.forEach((n, k) => { jobsNow[k].pkgs = n }); continue }
    if (e.t === 'size' || e.t === 'pending') continue
    if (e.t === 'stop') { stopped = true; continue }
    inJobs = false
    if (e.t === 'box') {
      if (!e.ok) problems.push(`${e.typed} is not a valid container number`)
      // listed under a "pending" / "off loaded" note: still waiting, on no truck
      if (stopped) { heldBoxes.push(e.no); continue }
      if (last && !last.boxes.length && (plateFirst || !last.mobileSeen) && !waitBoxes.length) { last.boxes.push(e.no); continue }
      waitBoxes.push(e.no)
      continue
    }
    if (e.t === 'pkgs' || e.t === 'pkglist') {
      const n = e.t === 'pkgs' ? e.n : e.list.reduce((a, b) => a + b, 0)
      if (last && last.pkgs == null && !waitPkgs && !last.mobileSeen) last.pkgs = n; else waitPkgs = n
      continue
    }
    if (e.t === 'plate') {
      // packages written on the job lines ("J-00800=01PKG") are what this truck carries
      const withPkgs = jobsNow.filter((j) => j.pkgs != null)
      const jobPkgs = withPkgs.length ? Object.fromEntries(withPkgs.map((j) => [j.jobNo, j.pkgs])) : null
      const fromJobs = jobPkgs && !trucks.some((t) => t.jobs.join() === jobsNow.map((j) => j.jobNo).join()) ? withPkgs.reduce((a, j) => a + j.pkgs, 0) : null
      last = { plate: e.plate, boxes: plateFirst ? [] : waitBoxes, pkgs: e.pkgs ?? waitPkgs ?? fromJobs, jobPkgs, mobile: waitMob, jobs: jobsNow.map((j) => j.jobNo), mobileSeen: !!waitMob }
      trucks.push(last)
      waitBoxes = []
      waitPkgs = null
      waitMob = null
      continue
    }
    if (e.t === 'mob') {
      // a mobile written just above a truck number is that truck's driver
      // (only when it starts its own block or sits right on the truck line: a truck's second
      // mobile, followed by a blank line and the next truck, stays with its own truck)
      const startsBlock = i === 0 || ['gap', 'job', 'box', 'pkgs', 'pkglist'].includes(ev[i - 1].t)
      if ((!last || last.mobile) && next(i)?.t === 'plate' && (ev[i + 1]?.t === 'plate' || startsBlock)) { waitMob = e.no; continue }
      if (last && !last.mobile) { last.mobile = e.no; last.mobileSeen = true }
      continue
    }
  }
  if (waitBoxes.length) {
    // containers after the last truck, with no truck of their own: probably still waiting
    problems.push(`${waitBoxes.join(', ')} ${waitBoxes.length === 1 ? 'has' : 'have'} no truck in the post`)
  }
  const jobsAll = [...new Map(ev.filter((e) => e.t === 'job').flatMap((e) => e.jobs).map((j) => [j.jobNo, j])).values()]
  // a truck written before any job line (rare): it belongs to every job in the post
  for (const t of trucks) if (!t.jobs.length) t.jobs = jobsAll.map((j) => j.jobNo)
  // a truck carrying one job: its packages are that job's (never another truck's count)
  for (const t of trucks) {
    if (t.jobs.length === 1) t.jobPkgs = t.pkgs != null ? { [t.jobs[0]]: t.pkgs } : null
    else if (t.jobPkgs && Object.keys(t.jobPkgs).length !== t.jobs.length) problems.push(`packages per job on ${t.plate} don't match the jobs listed`)
  }
  const sizes = ev.filter((e) => e.t === 'size')
  const pending = ev.filter((e) => e.t === 'pending')
  // the same truck or container twice in one post is a typing slip worth a word
  const seen = new Set()
  for (const t of trucks) { if (seen.has(t.plate)) problems.push(`truck ${t.plate} is written twice`); seen.add(t.plate) }
  const boxSeen = new Set()
  for (const t of trucks) for (const b of t.boxes) { if (boxSeen.has(b)) problems.push(`container ${b} is written twice`); boxSeen.add(b) }
  if (!jobsAll.length) problems.push('no job number in the post')
  return {
    kind: 'truck',
    jobs: jobsAll,
    trucks: trucks.map(({ mobileSeen, ...t }) => t),
    size: sizes.length ? { count: sizes.reduce((n, s) => n + s.n, 0), text: sizes.map((s) => `${s.n}x${s.ft}`).join(' + ') } : null,
    destuff: /\bd[e]?\s*stuff/i.test(raw),
    pending: pending.length ? pending.map((p) => p.text).join(' · ') : null,
    // (a "PENDING CONTAINER" heading with no number: the containers listed under it)
    pendingCount: pending.reduce((n, p) => n + (p.count || 0), 0) || heldBoxes.length || null,
    pendingBoxes: heldBoxes.length ? heldBoxes : null,
    problems,
  }
}

// ── which post is it ──
// A question ("where is MH46CU9963?", "J-583 truck kaha hai") is never a post: it goes to the
// assistant as before. WhatsApp's own tags, file names and links are taken out first.
const QUESTION = /\?|\b(where|kaha|kahan|kidhar|status|update|kya|batao|bata|check|eta|when|kab)\b/i
export function cleanPost(text) {
  return String(text || '').replace(/‎/g, '')
    .replace(/<attached:[^>]*>/gi, ' ').replace(/<this message was edited>/gi, ' ')
    .replace(/\S+\.(pdf|xlsx?|docx?|jpe?g|png|vcf|opus|mp4)\b(\s*•\s*\d+\s*pages?)?/gi, ' ')
    .split(/\r?\n/).filter((l) => !/https?:\/\//i.test(l)).map((l) => l.replace(/[ \t]+$/, '')).join('\n')
}
export function readPost(text, opts = {}) {
  const s = cleanPost(text)
  if (!s.trim()) return null
  const be = readBePost(s, opts)
  // a BE post has a job and a 7-digit BE number on a "BE" line, and no truck plates
  if (be && be.jobs.length && !platesIn(s.toUpperCase()).length) return be
  const truck = readTruckPost(s)
  if (!truck) return null
  // with no job number, a truck post needs something only a post says: a driver's mobile or
  // a container (a job number plus a truck is enough: some trucks go without a mobile)
  if (!truck.jobs.length && !truck.trucks.some((t) => t.mobile || t.boxes.length)) return null
  // an e-way bill request names trucks but isn't a dispatch: left to the assistant
  if (/\be[\s-]*way\s*bill|\bewb\b/i.test(s)) return null
  if (QUESTION.test(s) && !truck.trucks.some((t) => t.mobile)) return null
  return truck
}
