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
  const count = `${onIgm.size} container${onIgm.size === 1 ? '' : 's'} on this IGM (the whole ship)`
  let summary = `IGM found${ship ? `: ${ship}` : ''}, ${count}.`
  let tone = 'info'
  if (mine.length && found.length === mine.length) {
    summary += ` This job's container${found.length === 1 ? '' : 's'} ${found.length > 3 ? `(all ${found.length})` : found.join(', ')} ${found.length === 1 ? 'is' : 'are'} on it.`
    tone = 'good'
  } else if (mine.length && found.length) {
    summary += ` ${found.length} of this job's ${mine.length} containers are on it; not found: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}.`
    tone = 'warn'
  } else if (mine.length) {
    summary += ` This job's container${mine.length === 1 ? '' : 's'} ${mine.length > 3 ? '' : mine.join(', ') + ' '}${mine.length === 1 ? 'is' : 'are'} NOT on this IGM. Check the IGM number and date.`
    tone = 'bad'
  }
  const fields = (parsed.fields || []).filter((f) => f.label !== 'Importer')
  return {
    ...parsed,
    summary,
    tone,
    fields,
    note: 'ICEGATE gives only one importer name for the whole ship, so it is not shown. Your client is matched by container number.',
  }
}

const RULES = { 'ICEGATE/07': igm }

export function presentResult(api, parsed, job) {
  if (!parsed || !parsed.found || !RULES[api]) return parsed
  try {
    return RULES[api](parsed, job)
  } catch {
    return parsed
  }
}
