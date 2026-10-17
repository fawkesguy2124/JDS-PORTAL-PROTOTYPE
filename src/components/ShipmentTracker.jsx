import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import ShipmentTrackerDesktop from './desktop/ShipmentTrackerDesktop'
import ShipmentTrackerMobile from './mobile/ShipmentTrackerMobile'
import { runUlipCheck } from '../services/ulip/ulipClient'

// '2026-10-12' -> '12 Oct 2026'
function formatDay(iso) {
  if (!iso) return null
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00')
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ShipmentTracker({ jobs, profiles, currentUserName, showToast }) {
  const [search, setSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)
  const [ulipData, setUlipData] = useState({})
  const [loadingUlip, setLoadingUlip] = useState(false)
  const [truckInputs, setTruckInputs] = useState({})
  const [savingTruck, setSavingTruck] = useState({})

  // Filter jobs by search — matches job_no, containers, be_no, client
  const filteredJobs = jobs.filter(j => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      j.job_no?.toLowerCase().includes(q) ||
      j.client?.toLowerCase().includes(q) ||
      j.containers?.toLowerCase().includes(q) ||
      j.be_no?.toLowerCase().includes(q) ||
      j.bl_no?.toLowerCase().includes(q)
    )
  })

  // Load saved government data for a job. Opening a job never calls ULIP:
  // it reads what was saved by earlier checks. Only { refresh: true } (the
  // person pressing the refresh button) asks ULIP again, and the server
  // ignores repeats of the same check within 5 minutes.
  const loadUlipData = async (job, { refresh = false } = {}) => {
    if (!job) return
    setLoadingUlip(true)
    const data = {}

    try {
      if (refresh) {
        if (job.be_no && job.be_date) {
          await supabase.functions.invoke('customs-status', { body: { jobId: job.id } })
        }
        const truck = job.truck_no || truckInputs[job.id]
        if (truck) await runUlipCheck({ api: 'FASTAG/01', params: { vehiclenumber: truck }, jobId: job.id })
      }

      const firstContainer = (job.containers || '').split(/[s,;/]+/).map(x => x.trim().toUpperCase()).find(Boolean)
      const [csRes, fastagRes, ctRes] = await Promise.all([
        supabase.from('customs_status').select('*').eq('job_id', job.id).maybeSingle(),
        supabase.from('ulip_results').select('parsed, checked_at').eq('job_id', job.id).eq('api', 'FASTAG/01')
          .order('checked_at', { ascending: false, nullsFirst: false }).limit(1),
        firstContainer
          ? supabase.from('container_tracking').select('milestones').eq('container_no', firstContainer).limit(1)
          : Promise.resolve({ data: [] }),
      ])

      // Customs status (ICEGATE/03 + JNPT/02), saved by the customs-status check
      const cs = csRes.data
      if (cs) {
        data.beStatus = {
          beNumber: cs.be_no,
          oocDate: formatDay(cs.ooc_date),
          oocNo: cs.ooc_no,
          doNumber: cs.do_no,
          doDate: formatDay(cs.do_date),
          igmNumber: cs.igm_no,
          vehicleNumbers: (Array.isArray(cs.vehicles) ? cs.vehicles : []).map(v => v.number).filter(Boolean),
          checkedAt: cs.checked_at,
        }
      }

      // FASTag toll crossings (FASTAG/01), newest first
      const fastag = fastagRes.data?.[0]
      const crossings = fastag?.parsed?.tables?.[0]?.rows || []
      if (fastag) {
        data.fastagStatus = {
          tollCrossings: crossings.map(([plaza, time, direction]) => ({ tollPlazaName: plaza, readTime: time, laneDirection: direction })),
          checkedAt: fastag.checked_at,
        }
      }

      // Container events, saved by Container Tracking (LDB)
      const milestones = ctRes.data?.[0]?.milestones
      if (Array.isArray(milestones)) {
        data.ldbStatus = { events: milestones.map(m => ({ eventname: String(m.description || '').toUpperCase().trim(), timestamptimezone: m.date })) }
      }

      // Truck dispatched log — for sidebar accountability
      const { data: truckLogData } = await supabase
        .from('activity_log')
        .select('meta, created_at')
        .eq('job_no', job.job_no)
        .eq('type', 'truck_dispatched')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (truckLogData) {
        data.truckLog = {
          enteredBy: truckLogData.meta?.enteredBy || 'Field worker',
          timestamp: truckLogData.created_at
        }
      }

    } catch (err) {
      console.error('ULIP load error:', err)
    }

    setUlipData(prev => ({ ...prev, [job.id]: data }))
    setLoadingUlip(false)
  }

  useEffect(() => {
    if (selectedJob) loadUlipData(selectedJob)
  }, [selectedJob?.id])

  // Save truck number
  const saveTruckNumber = async (job, truckNo) => {
    if (!truckNo?.trim()) return
    setSavingTruck(prev => ({ ...prev, [job.id]: true }))
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ truck_no: truckNo.trim().toUpperCase() })
        .eq('id', job.id)
      if (error) throw error

      await supabase.from('activity_log').upsert({
        type: 'truck_dispatched',
        title: `Truck ${truckNo.trim().toUpperCase()} assigned — ${job.job_no}`,
        job_no: job.job_no,
        meta: {
          truckNo: truckNo.trim().toUpperCase(),
          enteredBy: currentUserName,
          timestamp: Date.now()
        }
      }, { onConflict: 'title,job_no' })

      setTruckInputs(prev => ({ ...prev, [job.id]: truckNo.trim().toUpperCase() }))
      showToast('Truck number saved', 'success')
      await loadUlipData({ ...job, truck_no: truckNo.trim().toUpperCase() })
    } catch (err) {
      showToast('Failed to save truck number', 'error')
    } finally {
      setSavingTruck(prev => ({ ...prev, [job.id]: false }))
    }
  }

  // Mark as delivered
  const markDelivered = async (job) => {
    try {
      await supabase.from('jobs').update({ stage: 10 }).eq('id', job.id)
      await supabase.from('activity_log').upsert({
        type: 'job_delivered',
        title: `Delivered — ${job.job_no}`,
        job_no: job.job_no,
        meta: { markedBy: currentUserName, timestamp: Date.now() }
      }, { onConflict: 'title,job_no' })
      showToast('Job marked as delivered', 'success')
    } catch {
      showToast('Failed to update', 'error')
    }
  }

  // Derive journey steps from job + ULIP data
  const getJourneySteps = (job, ulip) => {
    const be = ulip?.beStatus || {}
    const ldb = ulip?.ldbStatus || {}
    const fastag = ulip?.fastagStatus || {}
    const truckNo = job.truck_no || truckInputs[job.id] || be.vehicleNumbers?.[0]
    const tollCrossings = fastag?.tollCrossings || []
    const lastToll = tollCrossings[0]

    return [
      {
        id: 'vessel',
        label: 'Vessel arrived',
        done: !!job.eta && new Date(job.eta) <= new Date(),
        detail: job.vessel ? `${job.vessel}` : null,
        sub: job.eta ? `ETA: ${new Date(job.eta).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}` : null,
        api: 'JNPT/01'
      },
      {
        id: 'igm',
        label: 'IGM filed',
        done: !!(be.igmNumber || job.ulip_refs?.igm_no),
        detail: (be.igmNumber || job.ulip_refs?.igm_no) ? `IGM: ${be.igmNumber || job.ulip_refs?.igm_no}` : null,
        sub: job.ulip_refs?.igm_date ? new Date(job.ulip_refs.igm_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : null,
        api: 'ICEGATE/01'
      },
      {
        id: 'discharged',
        label: 'Container discharged',
        done: !!(ldb?.events?.some(e => e.eventname === 'PORT IN' || e.eventname === 'PORT OUT')),
        detail: job.containers?.split(/[\s,;/]+/)[0] || null,
        sub: ldb?.events?.find(e => e.eventname === 'PORT IN')?.timestamptimezone
          ? new Date(ldb.events.find(e => e.eventname === 'PORT IN').timestamptimezone).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
          : null,
        api: 'LDB/01'
      },
      {
        id: 'cfs',
        label: 'Moved to CFS',
        done: !!(ldb?.events?.some(e => e.eventname === 'CFS IN' || e.eventname === 'ICD IN')),
        detail: job.cfs_name || null,
        sub: ldb?.events?.find(e => e.eventname === 'CFS IN')?.timestamptimezone
          ? new Date(ldb.events.find(e => e.eventname === 'CFS IN').timestamptimezone).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
          : null,
        api: 'LDB/01'
      },
      {
        id: 'ooc',
        label: 'Out of charge granted',
        done: !!be.oocDate,
        detail: be.oocDate ? `OOC: ${be.oocDate}` : null,
        sub: be.doNumber ? `DO No: ${be.doNumber}` : null,
        current: !be.oocDate && !!job.be_no,
        api: 'JNPT/02'
      },
      {
        id: 'truck',
        label: 'Truck dispatched',
        done: !!truckNo && tollCrossings.length > 0,
        current: !!be.oocDate && !truckNo,
        truckNo,
        lastToll,
        tollCrossings,
        api: 'FASTAG/01'
      },
      {
        id: 'transit',
        label: 'Truck in transit',
        done: tollCrossings.length > 0,
        lastToll,
        api: 'FASTAG/01'
      },
      {
        id: 'delivered',
        label: 'Delivered to warehouse',
        done: Number(job.stage) === 10,
        api: null
      },
    ]
  }

  // Job status for colour coding
  const getJobStatus = (job, ulip) => {
    const be = ulip?.beStatus || {}
    if (Number(job.stage) === 10) return { label: 'Delivered', color: 'green' }
    if (be.oocDate && !job.truck_no) return { label: 'OOC — truck pending', color: 'blue' }
    if (be.oocDate) return { label: 'In transit', color: 'blue' }
    if (job.be_no && !be.oocDate) return { label: 'Customs pending', color: 'amber' }
    if (job.containers) return { label: 'At port/CFS', color: 'amber' }
    return { label: 'Vessel awaited', color: 'gray' }
  }

  const props = {
    jobs: filteredJobs,
    allJobs: jobs,
    profiles,
    currentUserName,
    showToast,
    search, setSearch,
    selectedJob, setSelectedJob,
    ulipData,
    loadingUlip,
    truckInputs, setTruckInputs,
    savingTruck,
    saveTruckNumber,
    markDelivered,
    loadUlipData,
    getJourneySteps,
    getJobStatus,
  }

  return (
    <>
      <div className="block md:hidden">
        <ShipmentTrackerMobile {...props} />
      </div>
      <div className="hidden md:block">
        <ShipmentTrackerDesktop {...props} />
      </div>
    </>
  )
}