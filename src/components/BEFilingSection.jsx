import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import BEFilingDesktop from './desktop/BEFilingDesktop'

const BE_TYPE_OPTIONS = ['H', 'W', 'E', 'T', 'B']
const FCL_LCL_OPTIONS = ['FCL', 'LCL']
const VALUATION_METHODS = ['Rule 3', 'Rule 4', 'Rule 5', 'Rule 6', 'Rule 7', 'Rule 8']

function calculateCompleteness(draft) {
  if (!draft || draft.status === 'not_started') return 0

  const partIFields = ['be_type','port_code','igm_no','igm_date','container_no','fcl_lcl','package_count','gross_weight','country_of_origin','port_of_discharge','importer_name','importer_iec','supplier_name']
  const partIFilled = partIFields.filter(k => draft[k] && String(draft[k]).trim() !== '').length
  const partIScore = (partIFilled / partIFields.length) * 30

  const invoices = draft.invoices || []
  const hasInvoices = invoices.length > 0
  const partIIa = hasInvoices ? 20 : 0

  const items = draft.line_items || []
  const totalItems = items.length
  const itemsWithCth = totalItems ? items.filter(i => i.cth && String(i.cth).trim() !== '').length : 0
  const partIIb = totalItems ? (itemsWithCth / totalItems) * 25 : 0

  const dutyLines = draft.duty_lines || []
  const uniqueCths = [...new Set((items || []).map(i => i.cth).filter(Boolean))]
  const dutyRatesFilled = uniqueCths.length ? dutyLines.filter(d => d.bcd_rate && d.igst_rate).length : 0
  const partIII = uniqueCths.length ? (dutyRatesFilled / uniqueCths.length) * 15 : 0

  const docs = draft.supporting_docs || []
  const allPresent = docs.length ? docs.every(d => d.present) : false
  const partIV = docs.length ? (allPresent ? 10 : 0) : 0

  return Math.round(partIScore + partIIa + partIIb + partIII + partIV)
}

function mapOCRToDraft(ocrData) {
  const data = ocrData || {}
  const get = (key) => data[key]?.value || null
  const getArr = (key) => {
    const v = data[key]?.value
    if (!v) return []
    if (Array.isArray(v)) return v
    return String(v).split(',').map(s => s.trim()).filter(Boolean)
  }

  const containerArr = getArr('container_numbers')
  const sealArr = getArr('seal_numbers')
  const invoiceNums = getArr('invoice_numbers')
  const invoiceDates = getArr('invoice_dates')
  const invoiceAmounts = getArr('invoice_amounts')
  const invoiceCurrencies = getArr('invoice_currencies')

  const invoices = invoiceNums.map((num, i) => ({
    invoice_no: num,
    date: invoiceDates[i] || null,
    amount: invoiceAmounts[i] ? Number(invoiceAmounts[i]) : null,
    currency: invoiceCurrencies[i] || null,
    payment_terms: get('payment_terms'),
    freight_amount: get('freight_amount') ? Number(get('freight_amount')) : null,
    insurance_amount: get('insurance_amount') ? Number(get('insurance_amount')) : null,
  }))

  let lineItems = []
  try {
    const raw = data['invoice_line_items']?.value
    if (raw) {
      lineItems = typeof raw === 'string' ? JSON.parse(raw) : raw
    }
  } catch (e) {}

  let exchangeRates = null
  try {
    const raw = data['exchange_rates']?.value
    if (raw) {
      exchangeRates = typeof raw === 'string' ? JSON.parse(raw) : raw
    }
  } catch (e) {}

  let supportingDocs = []
  try {
    const raw = data['supporting_documents']?.value
    if (raw) {
      supportingDocs = typeof raw === 'string' ? JSON.parse(raw) : raw
    }
  } catch (e) {}

  if (!supportingDocs.length && invoiceNums.length) {
    supportingDocs.push({
      type: 'Commercial Invoice', reference_no: invoiceNums[0] || '', date: invoiceDates[0] || '', present: true,
    })
    supportingDocs.push({
      type: 'Packing List', reference_no: '', date: '', present: false,
    })
  }

  return {
    be_type: null,
    port_code: get('port_of_discharge'),
    cb_code: 'AADCJ9119RCH001',
    igm_no: get('igm_number'),
    igm_date: get('igm_date'),
    hawb_no: get('hawb_number'),
    hawb_date: get('hawb_date'),
    bl_date: get('bl_date'),
    container_no: containerArr.join(', '),
    seal_no: sealArr.join(', '),
    fcl_lcl: containerArr.length ? 'FCL' : null,
    package_count: get('package_count') ? Number(get('package_count')) : null,
    gross_weight: get('gross_weight') ? Number(get('gross_weight')) : null,
    net_weight: get('net_weight') ? Number(get('net_weight')) : null,
    country_of_origin: get('country_of_origin'),
    country_of_consignment: get('country_of_consignment'),
    port_of_loading: get('port_of_loading'),
    port_of_shipment: get('port_of_shipment'),
    port_of_discharge: get('port_of_discharge'),
    importer_name: get('consignee_name'),
    importer_address: get('consignee_address'),
    importer_gstin: get('importer_gstin'),
    importer_iec: get('importer_iec'),
    ad_code: get('ad_code'),
    supplier_name: get('supplier_name'),
    supplier_address: get('supplier_address'),
    supplier_country: get('supplier_country'),
    invoices: invoices.length ? invoices : null,
    exchange_rates: exchangeRates,
    line_items: lineItems.length ? lineItems : null,
    supporting_docs: supportingDocs.length ? supportingDocs : null,
    svb_flag: false,
    svb_reference: null,
    valuation_method: 'Rule 3',
    bond_no: null,
    bond_port: null,
    bond_cd: null,
    debt_amount: null,
    bg_amount: null,
  }
}

export default function BEFilingSection({ jobs, currentUserName, showToast, user }) {
  const [beDrafts, setBeDrafts] = useState({})
  const [clientMaster, setClientMaster] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectingJob, setSelectingJob] = useState(false)
  const [draftTab, setDraftTab] = useState('part1')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadBEDrafts()
    loadClientMaster()
  }, [])

  const loadBEDrafts = async () => {
    const { data } = await supabase.from('be_drafts').select('*')
    if (data) {
      const map = {}
      for (const d of data) map[d.job_id] = d
      setBeDrafts(map)
    }
  }

  const loadClientMaster = async () => {
    const { data } = await supabase.from('client_master').select('*').order('client_name')
    setClientMaster(data || [])
  }

  const getDraft = (jobId) => beDrafts[jobId] || null

  const saveBEDraft = async (draftId, data) => {
    setSaving(true)
    try {
      const completeness = calculateCompleteness(data)
      const payload = { ...data, completeness_pct: completeness, updated_at: new Date().toISOString() }
      delete payload.id
      delete payload.created_at

      const { data: updated, error } = await supabase
        .from('be_drafts')
        .update(payload)
        .eq('id', draftId)
        .select()
        .single()

      if (error) throw error

      const status = completeness >= 90 ? 'ready' : 'in_progress'
      await supabase.from('be_drafts').update({ status }).eq('id', draftId)

      setBeDrafts(prev => ({
        ...prev,
        [updated.job_id]: { ...updated, status, completeness_pct: completeness },
      }))
      showToast('BE Draft saved.', 'success')
    } catch (e) {
      showToast(`Save failed: ${e.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const autoSaveBEDraft = async (draftId, data) => {
    try {
      const completeness = calculateCompleteness(data)
      const payload = { ...data, completeness_pct: completeness, updated_at: new Date().toISOString() }
      delete payload.id
      delete payload.created_at
      await supabase.from('be_drafts').update(payload).eq('id', draftId)
      const status = completeness >= 90 ? 'ready' : 'in_progress'
      await supabase.from('be_drafts').update({ status }).eq('id', draftId)
      const { data: updated } = await supabase.from('be_drafts').select('*').eq('id', draftId).single()
      if (updated) {
        setBeDrafts(prev => ({ ...prev, [updated.job_id]: updated }))
      }
    } catch (e) {
      console.warn('Auto-save failed:', e.message)
    }
  }

  const markAsFiled = async (draftId, jobId) => {
    try {
      const now = new Date().toISOString()
      await supabase.from('be_drafts').update({
        status: 'filed', filed_by: currentUserName, filed_at: now, updated_at: now,
      }).eq('id', draftId)

      await supabase.from('jobs').update({ stage: 4 }).eq('id', jobId)

      const job = jobs.find(j => j.id === jobId)
      await supabase.from('activity_log').insert({
        job_id: jobId, job_no: job?.job_no || '',
        action: 'stage',
        description: 'BE filed — moved to Customs Review',
        performed_by: currentUserName,
      })

      const { data: updated } = await supabase.from('be_drafts').select('*').eq('id', draftId).single()
      if (updated) {
        setBeDrafts(prev => ({ ...prev, [jobId]: updated }))
      }
      showToast('BE marked as filed.', 'success')
    } catch (e) {
      showToast(`Failed to mark as filed: ${e.message}`, 'error')
    }
  }

  const saveClientMaster = async (clientName, data) => {
    try {
      const existing = clientMaster.find(c => c.client_name === clientName)
      if (existing) {
        await supabase.from('client_master').update(data).eq('id', existing.id)
      } else {
        await supabase.from('client_master').insert({ client_name: clientName, ...data })
      }
      await loadClientMaster()
      showToast('Client saved to master.', 'success')
    } catch (e) {
      showToast(`Failed to save client: ${e.message}`, 'error')
    }
  }

  const calculateDuties = (lineItems, exchangeRates) => {
    if (!lineItems || !lineItems.length) return { dutyLines: [], totals: {} }

    const grouped = {}
    for (const item of lineItems) {
      const cth = item.cth || 'UNKNOWN'
      if (!grouped[cth]) grouped[cth] = []
      grouped[cth].push(item)
    }

    const dutyLines = []
    for (const [cth, items] of Object.entries(grouped)) {
      const totalAmount = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
      const currency = items[0]?.currency || 'USD'
      const rate = exchangeRates?.[currency] || 1
      const assessableValue = Math.round(totalAmount * rate)
      dutyLines.push({
        cth, assessable_value: assessableValue,
        bcd_rate: null, bcd_amt: null,
        sws_rate: null, sws_amt: null,
        igst_rate: null, igst_amt: null,
        total_duty: null,
        currency, exchange_rate: rate,
      })
    }

    return dutyLines
  }

  const filedJobs = new Set(
    Object.values(beDrafts).filter(d => d.status === 'filed').map(d => d.job_id)
  )

  const handleSelectJob = async (job) => {
    setSelectedJob(job)
    const existing = getDraft(job.id)
    if (existing) return
    setSelectingJob(true)
    try {
      const { data: extraction } = await supabase
        .from('job_extractions')
        .select('extracted_data')
        .eq('job_id', job.id)
        .order('extracted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const ocrData = extraction?.extracted_data || {}
      const prefill = mapOCRToDraft(ocrData)

      const { data: inserted, error } = await supabase
        .from('be_drafts')
        .insert({
          job_id: job.id, job_no: job.job_no,
          status: 'in_progress', completeness_pct: 0,
          ...prefill,
        })
        .select()
        .single()

      if (error) throw error

      await supabase.from('jobs').update({ stage: 3 }).eq('id', job.id)
      await supabase.from('activity_log').insert({
        job_id: job.id, job_no: job.job_no,
        action: 'stage',
        description: 'BE Draft auto-created — moved to BE Filing',
        performed_by: currentUserName,
      })

      setBeDrafts(prev => ({ ...prev, [job.id]: inserted }))
    } catch (e) {
      showToast(`Failed to create BE Draft: ${e.message}`, 'error')
    } finally {
      setSelectingJob(false)
    }
  }

  return (
    <BEFilingDesktop
      jobs={jobs}
      beDrafts={beDrafts}
      clientMaster={clientMaster}
      selectedJob={selectedJob}
      selectingJob={selectingJob}
      onSelectJob={handleSelectJob}
      draftTab={draftTab}
      setDraftTab={setDraftTab}
      saving={saving}
      filedJobs={filedJobs}
      getDraft={getDraft}
      onSaveDraft={saveBEDraft}
      onAutoSave={autoSaveBEDraft}
      onMarkFiled={markAsFiled}
      onSaveClientMaster={saveClientMaster}
      calculateDuties={calculateDuties}
      BE_TYPE_OPTIONS={BE_TYPE_OPTIONS}
      FCL_LCL_OPTIONS={FCL_LCL_OPTIONS}
      VALUATION_METHODS={VALUATION_METHODS}
      showToast={showToast}
      currentUserName={currentUserName}
      user={user}
    />
  )
}
