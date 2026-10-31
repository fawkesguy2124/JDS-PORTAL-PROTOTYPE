import { parseContainerNos } from '../../utils/jobHelpers'

// Adjusts how a saved ULIP answer is shown for THIS job. The saved answer is
// not changed; this only decides the headline and which fields to show.

// ICEGATE/07: one IGM covers a whole ship (thousands of containers, many
// importers), but ICEGATE returns only ONE importer name for all of it. That
// name is not this job's client, so it is not shown. What matters for the job
// is whether its own containers are on this IGM.
function igm(parsed, job) {
  const extra = parsed.extra || {}
  const onIgm = new Set((extra.containerNumbers || []).map((c) => String(c).toUpperCase()))
  const mine = parseContainerNos(job?.containers)
  const found = mine.filter((c) => onIgm.has(c))
  const missing = mine.filter((c) => !onIgm.has(c))
  const ship = [extra.vesselCode && `vessel ${extra.vesselCode}`, extra.voyageNo && `voyage ${extra.voyageNo}`].filter(Boolean).join(', ')
  const lines = (extra.containerNumbers || []).length
  const count = `${onIgm.size} container${onIgm.size === 1 ? '' : 's'}${lines > onIgm.size ? ` on ${lines} lines` : ''} on this IGM (the whole ship)`
  const who = (n) => `${job?.client ? `${job.client}'s` : "This job's"} container${n === 1 ? '' : 's'}`
  let summary = `IGM found${ship ? `: ${ship}` : ''}, ${count}.`
  let tone = 'info'
  if (mine.length && found.length === mine.length) {
    summary += ` ${who(found.length)} ${found.length > 3 ? `(all ${found.length})` : found.join(', ')} ${found.length === 1 ? 'is' : 'are'} on it.`
    tone = 'good'
  } else if (mine.length && found.length) {
    summary += ` ${found.length} of ${who(mine.length)} (${mine.length}) are on it; not found: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}.`
    tone = 'warn'
  } else if (mine.length) {
    summary += ` ${who(mine.length)} ${mine.length > 3 ? '' : mine.join(', ') + ' '}${mine.length === 1 ? 'is' : 'are'} NOT on this IGM. Check the IGM number and date.`
    tone = 'bad'
  }
  const fields = [
    ...(job?.client ? [{ label: 'Client (this job)', value: job.client }] : []),
    ...(found.length ? [{ label: "This job's containers on it", value: found.length > 3 ? `${found.length} of ${mine.length}` : found.join(', ') }] : []),
    ...(parsed.fields || []).filter((f) => f.label !== 'Importer'),
  ]
  const tables = (parsed.tables || []).map((t) => (t.title === 'Containers' ? { ...t, title: 'All lines on this IGM' } : t))
  return {
    ...parsed,
    summary,
    tone,
    fields,
    tables,
    note: 'Customs does not say which company owns each container (it gives one importer name for the whole ship), so the client shown is the one on this job, matched by container number.',
  }
}

// Checks that look a BE up by its NUMBER only (ports): BE numbers repeat
// over the years and across customs houses, so the answer can be someone
// else's old BE (seen 19 Oct 2026: BE 4501905 of J-677, 17 Oct 2026 at
// INBOM4, came back as a 2021 Chennai BE with "OOC granted"). If the BE date
// or the customs house don't match this job, the answer is not shown at all:
// it counts as "no record for this job's BE". Same 30-day idea as containers
// (tracking older than 30 days is not treated as this job's).
const SAME_BE_WITHIN_DAYS = 30
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
function dayOf(v) {
  const s = String(v || '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3])
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})/)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1])
  return null
}
const fieldValue = (parsed, label) => (parsed.fields || []).find((f) => f.label === label)?.value || null
function sameBe(parsed, job) {
  const theirDay = dayOf(fieldValue(parsed, 'BE date') || parsed.extra?.beDate)
  // compare with the job's BE date; with no BE date yet, with today
  const ourDay = dayOf(job?.be_date) ?? Date.now()
  const house = String(fieldValue(parsed, 'Customs house') || '').toUpperCase()
  const port = String(job?.port_code || '').toUpperCase()
  const dateWrong = theirDay !== null && Math.abs(theirDay - ourDay) > SAME_BE_WITHIN_DAYS * 864e5
  const houseWrong = !!house && !!port && house.slice(0, 5) !== port.slice(0, 5)
  if (!dateWrong && !houseWrong) return parsed
  // someone else's BE: show nothing of it, only that this job's BE isn't there
  return {
    found: false,
    tone: 'warn',
    summary: `No record yet for this job's BE ${job?.be_no || ''}.`.replace(' .', '.'),
    fields: [],
    note: 'Only an older Bill of Entry with the same number was found (BE numbers repeat over the years), so it is not shown.',
  }
}

const RULES = { 'ICEGATE/07': igm, 'MBPT/02': sameBe, 'IPORTMAN/02': sameBe }

export function presentResult(api, parsed, job) {
  if (!parsed || !parsed.found || !RULES[api]) return parsed
  try {
    return RULES[api](parsed, job)
  } catch {
    return parsed
  }
}
