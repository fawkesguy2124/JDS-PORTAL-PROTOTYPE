import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import ShipmentTrackerDesktop from './desktop/ShipmentTrackerDesktop'
import ShipmentTrackerMobile from './mobile/ShipmentTrackerMobile'

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

  // Load ULIP data for selected job
  const loadUlipData = async (job) => {
    if (!job) return
    setLoadingUlip(true)
    const data = {}

    try {
      // JNPT/02 — BE status, OOC, vehicle numbers
      if (job.be_no) {
        const { data: beData } = await supabase.functions.invoke('jnpt-be-status', {
          body: { beNumber: job.be_no }
        })
        if (beData?.success) data.beStatus = beData.data
      }

      // LDB/01 — container events (use existing ldb-track function)
      if (job.containers) {
        const containerNos = job.containers.split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
        if (containerNos[0]) {
          const { data: ldbData } = await supabase.functions.invoke('ldb-track', {
            body: { cntrNo: containerNos[0] }
          })
          if (ldbData) data.ldbStatus = ldbData
        }
      }

      // FASTAG/01 — truck toll crossings
      const truckNo = job.truck_no || truckInputs[job.id] || data.beStatus?.vehicleNumbers?.[0]
      if (truckNo) {
        const { data: fastagData } = await supabase.functions.invoke('fastag-vehicle', {
          body: { vehiclenumber: truckNo }
        })
        if (fastagData?.success) data.fastagStatus = fastagData.data
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
        done: !!job.igm_no,
        detail: job.igm_no ? `IGM: ${job.igm_no}` : null,
        sub: job.igm_date ? new Date(job.igm_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : null,
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