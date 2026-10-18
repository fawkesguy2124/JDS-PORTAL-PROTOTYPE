// Document types a job can have. Each type is uploaded once per job, except
// "Other", which can be used as often as needed.
export const DOC_TYPES = ['BL', 'Invoice', 'Packing List', 'COO', 'Insurance', 'BE', 'Examination Order', 'OOC', 'E-Way Bill', 'POD', 'Other']
export const REPEATABLE = ['Other']

// What the PDF reader found inside a file, as these type names (bundles
// count for every document inside them; an air waybill counts as the BL)
const FROM_READER = { be: 'BE', ooc: 'OOC', bl: 'BL', awb: 'BL', invoice: 'Invoice', packing_list: 'Packing List', insurance: 'Insurance', coo: 'COO' }
export const typesFoundInside = (documents = []) => [...new Set(documents.map((d) => FROM_READER[d.type]).filter(Boolean))]

// The types still free for this job. `used` = types already on the job;
// `keep` = the type currently chosen in this dropdown (always shown).
export function availableTypes(used = [], keep = null) {
  const taken = new Set(used.filter(Boolean))
  return DOC_TYPES.filter((t) => REPEATABLE.includes(t) || t === keep || !taken.has(t))
}
