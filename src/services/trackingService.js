import { supabase } from '../supabase'

export async function fetchAllTracking() {
  const { data, error } = await supabase
    .from('container_tracking')
    .select('*')
    .order('last_update', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(rowToContainer)
}

export async function lookupAndSaveContainer(containerNo, carrier, jobNo = null, jobId = null) {
  if (!containerNo) return
  const cn = containerNo.trim().toUpperCase()
  if (!cn) return

  const { data: existing } = await supabase
    .from('container_tracking')
    .select('container_no')
    .eq('container_no', cn)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('container_tracking')
      .update({ job_no: jobNo, job_id: jobId, carrier: carrier })
      .eq('container_no', cn)
    return
  }

  const { error } = await supabase
    .from('container_tracking')
    .insert({
      container_no:     cn,
      carrier:          carrier,
      job_no:           jobNo,
      job_id:           jobId,
      status:           'in_transit',
      status_text:      'In Transit',
      current_location: null,
      vessel:           null,
      eta:              null,
      free_days:        null,
      notes:            null,
      last_update:      new Date().toISOString(),
      milestones:       [],
    })
  if (error && !error.message.includes('duplicate')) throw new Error(error.message)
}

export async function updateContainerStatus(containerNo, updates) {
  if (!containerNo) throw new Error('Container number is required')

  const freeDays = (() => {
    if (updates.freeDays === '' || updates.freeDays === null || updates.freeDays === undefined) return null
    const n = Number(updates.freeDays)
    return Number.isFinite(n) ? n : null
  })()

  const { error } = await supabase
    .from('container_tracking')
    .update({
      status:           updates.status           || null,
      status_text:      updates.statusText       || null,
      current_location: updates.currentLocation  || null,
      vessel:           updates.vessel           || null,
      eta:              updates.eta              || null,
      free_days:        freeDays,
      notes:            updates.notes            || null,
      port_in:          updates.portIn           || null,
      port_out:         updates.portOut          || null,
      cfs_gate_in:      updates.cfsGateIn        || null,
      last_update:      new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    })
    .eq('container_no', containerNo)
  if (error) throw new Error(error.message)
}

export async function addMilestone(containerNo, milestoneOrDescription, location) {
  if (!containerNo) throw new Error('Container number is required')

  let description, milestoneLocation, milestoneDate
  if (milestoneOrDescription && typeof milestoneOrDescription === 'object') {
    description       = milestoneOrDescription.description
    milestoneLocation = milestoneOrDescription.location || ''
    milestoneDate     = milestoneOrDescription.date || new Date().toISOString()
  } else {
    description       = milestoneOrDescription
    milestoneLocation = location || ''
    milestoneDate     = new Date().toISOString()
  }

  if (!description) throw new Error('Milestone description is required')

  const { data, error } = await supabase
    .from('container_tracking')
    .select('milestones')
    .eq('container_no', containerNo)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error(`Container ${containerNo} not found in tracking`)

  const existing = data?.milestones || []
  const newMilestone = {
    description,
    location: milestoneLocation,
    date: milestoneDate,
  }
  const updated = [newMilestone, ...existing]

  const { error: updateError } = await supabase
    .from('container_tracking')
    .update({ milestones: updated, last_update: new Date().toISOString() })
    .eq('container_no', containerNo)
  if (updateError) throw new Error(updateError.message)
}

export async function deleteTracking(containerNo) {
  if (!containerNo) throw new Error('Container number is required for deletion')
  const cn = (containerNo || '').trim().toUpperCase()
  if (!cn) throw new Error('Container number is required for deletion')
  const { error } = await supabase
    .from('container_tracking')
    .delete()
    .eq('container_no', cn)
  if (error) throw new Error(error.message)
}

export async function checkContainerStatus(containerNo, carrier) {
  const cn = containerNo.trim().toUpperCase()

  const res = await fetch(`/api/track?container=${cn}&carrier=${encodeURIComponent(carrier)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Tracking failed: ${res.status}`)
  }
  const data = await res.json()

  await supabase.from('container_tracking').upsert({
    container_no:       cn,
    carrier:            carrier,
    status:             data.status,
    status_text:        data.statusText,
    current_location:   data.currentLocation,
    vessel:             data.vessel,
    eta:                data.eta,
    port_in:            data.portIn,
    port_out:           data.portOut,
    cfs_gate_in:        data.cfsGateIn,
    last_update:        data.lastUpdate,
    milestones:         data.milestones,
    auto_status:        data,
    last_auto_update:   new Date().toISOString(),
    auto_source:        carrier,
    tracking_sync_status: 'success',
    tracking_error:     null,
  }, { onConflict: 'container_no' })

  return data
}

function rowToContainer(row) {
  return {
    id:              row.id,
    containerNo:     row.container_no,
    jobNumber:       row.job_no,
    jobId:           row.job_id,
    carrier:         row.carrier,
    status:          row.status,
    statusText:      row.status_text,
    currentLocation: row.current_location,
    vessel:          row.vessel,
    eta:             row.eta,
    freeDays:        row.free_days,
    notes:           row.notes,
    lastUpdate:      row.last_update,
    portIn:          row.port_in,
    portOut:         row.port_out,
    cfsGateIn:       row.cfs_gate_in,
    milestones:      row.milestones || [],
  }
}