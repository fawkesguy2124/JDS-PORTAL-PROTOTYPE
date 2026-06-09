import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { updateContainerStatus, addMilestone } from '../services/trackingService'
import { refreshAllContainers, forceRefreshAllContainers, fetchLDBTracking, persistLDBTracking } from '../services/tracking/ldbProvider'
import ContainerTrackingMobile  from './mobile/ContainerTrackingMobile'
import ContainerTrackingDesktop from './desktop/ContainerTrackingDesktop'

function formatContainerDate(ts) {
  if (!ts) return '\u2014'
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function JobDetailPanel({ job, trackingData, onClose, onUpdate, onAddEvent, onRefresh, showToast, activeContainer, onCloseRef }) {
  const cnList = (job.containers || '')
    .split(/[\s,;/]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length >= 4)

  const initialIdx = activeContainer
    ? Math.max(0, cnList.indexOf(activeContainer))
    : 0

  const [activeCnIdx, setActiveCnIdx] = useState(initialIdx)
  const tabsRef = useRef(null)
  const activeTabRef = useRef(null)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const dragX = useRef(0)
  const sidebarRef = useRef(null)
  const isDragging = useRef(false)
  const [closing, setClosing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current) }
  }, [])

  useEffect(() => {
    if (activeContainer) {
      const idx = cnList.indexOf(activeContainer)
      if (idx >= 0) setActiveCnIdx(idx)
    }
  }, [activeContainer])

  useEffect(() => {
    if (activeTabRef.current && tabsRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [activeCnIdx])

  const handleClose = () => {
    setClosing(true)
    closeTimerRef.current = setTimeout(() => {
      setClosing(false)
      onClose()
    }, 220)
  }

  useEffect(() => {
    if (onCloseRef) onCloseRef.current = handleClose
  }, [handleClose, onCloseRef])

  const formatDT = (d) => d ? new Date(d).toLocaleString('en-IN', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata'
  }) : '—'
  const formatD = (d) => d ? new Date(d).toLocaleDateString('en-IN', {
    day:'2-digit', month:'short', year:'numeric', timeZone:'Asia/Kolkata'
  }) : '—'

  const STATUS_STYLES_MAP = {
    in_transit:     { bg:'#FAEEDA', color:'#633806', border:'#FAC775',  header:'#0f1e35' },
    arrived:        { bg:'#EAF3DE', color:'#27500A', border:'#C0DD97',  header:'#0d2b1e' },
    at_cfs:         { bg:'#E1F5EE', color:'#085041', border:'#9FE1CB',  header:'#0a2420' },
    customs_hold:   { bg:'#FAEEDA', color:'#633806', border:'#FAC775',  header:'#1f1505' },
    on_rail:        { bg:'#EEEDFE', color:'#26215C', border:'#AFA9EC',  header:'#150d2b' },
    delivered:      { bg:'#EAF3DE', color:'#173404', border:'#639922',  header:'#0d1f0d' },
    empty_returned: { bg:'#F1EFE8', color:'#2C2C2A', border:'#B4B2A9', header:'#1a1a1a' },
    delayed:        { bg:'#FCEBEB', color:'#791F1F', border:'#F7C1C1',  header:'#1f0808' },
  }

  const safeIdx = Math.min(activeCnIdx, Math.max(0, cnList.length - 1))
  const cn = cnList[safeIdx] || cnList[0]
  const td = trackingData[cn] || {}
  const status = td.status || 'in_transit'
  const isDetention = td.freeDays != null && td.freeDays <= 2
  const effectiveStatus = isDetention ? 'delayed' : status
  const st = STATUS_STYLES_MAP[effectiveStatus] || STATUS_STYLES_MAP['in_transit']
  const headerBg = st.header

  const contractualFreeDays = job.free_days ? Math.min(30, Math.max(1, Number(job.free_days) || 1)) : null
  const freePct = contractualFreeDays != null && td.freeDays != null
    ? Math.max(0, Math.min(100, ((contractualFreeDays - td.freeDays) / contractualFreeDays) * 100))
    : 0
  const detentionDate = td.portIn
    ? new Date(new Date(td.portIn).getTime() + contractualFreeDays * 86400000)
        .toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', timeZone:'Asia/Kolkata' })
    : null

  const getEventStyle = (desc) => {
    const d = (desc || '').toUpperCase()
    if (d.includes('GATE CROSSED') || d.includes('GATE OUT')) return { color:'#185FA5', dot:'blue' }
    if (d.includes('PORT IN') || d.includes('PORTIN'))         return { color:'#185FA5', dot:'blue' }
    if (d.includes('PORT OUT') || d.includes('PORTOUT'))       return { color:'#0F6E56', dot:'green' }
    if (d.includes('CFS') || d.includes('ICD') || d.includes('DPD')) return { color:'#854F0B', dot:'amber' }
    if (d.includes('VESSEL') || d.includes('LOADING'))         return { color:'#0F6E56', dot:'green' }
    if (d.includes('CUSTOMS') || d.includes('HOLD'))           return { color:'#A32D2D', dot:'red' }
    return { color:'var(--color-text-primary)', dot:'gray' }
  }

  const dotStyles = {
    blue:  { bg:'#E6F1FB', border:'#185FA5', inner:'#185FA5' },
    green: { bg:'#EAF3DE', border:'#1D9E75', inner:'#1D9E75' },
    amber: { bg:'#FAEEDA', border:'#EF9F27', inner:'#EF9F27' },
    red:   { bg:'#FCEBEB', border:'#E24B4A', inner:'#E24B4A' },
    gray:  { bg:'var(--color-background-secondary)', border:'var(--color-border-tertiary)', inner:'var(--color-border-tertiary)' },
  }

  if (cnList.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes slideInRight { from { transform:translateX(100%) } to { transform:translateX(0) } }
        @keyframes slideOutRight { from { transform:translateX(0) } to { transform:translateX(100%) } }
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @keyframes expandDown { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }
      `}</style>

      <div
        ref={sidebarRef}
        data-sidebar="container-detail"
        style={{
          position:'fixed', right:0, top:0, bottom:0, width:'min(680px,100vw)',
          background:'#ffffff',
          borderLeft:'1.5px solid #d0d9e8',
          zIndex:300, display:'flex', flexDirection:'column',
          boxShadow:'-16px 0 48px rgba(0,0,0,0.18)',
          animation: closing
            ? 'slideOutRight 0.22s cubic-bezier(0.4,0,1,1) forwards'
            : 'slideInRight 0.25s cubic-bezier(0.16,1,0.3,1)',
        }}
        onTouchStart={e => {
          if (window.innerWidth >= 768) return
          touchStartX.current = e.touches[0].clientX
          touchStartY.current = e.touches[0].clientY
          dragX.current = 0
          isDragging.current = false
          if (sidebarRef.current) {
            sidebarRef.current.style.transition = 'none'
            sidebarRef.current.style.transform = 'translateX(0)'
            sidebarRef.current.style.opacity = '1'
          }
        }}
        onTouchMove={e => {
          if (window.innerWidth >= 768) return
          if (touchStartX.current === null) return
          const deltaX = e.touches[0].clientX - touchStartX.current
          const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current)

          if (!isDragging.current) {
            if (deltaX > 10 && deltaX > deltaY) {
              isDragging.current = true
            } else if (deltaY > 10) {
              touchStartX.current = null
              return
            }
          }

          if (isDragging.current && deltaX > 0) {
            dragX.current = deltaX
            if (sidebarRef.current) {
              sidebarRef.current.style.transform = `translateX(${deltaX}px)`
              sidebarRef.current.style.opacity = `${Math.max(0.5, 1 - deltaX / 400)}`
            }
          }
        }}
        onTouchEnd={e => {
          if (window.innerWidth >= 768) return
          if (touchStartX.current === null) return

          if (isDragging.current && dragX.current > 120) {
            // Continue sliding out from current drag position
            if (sidebarRef.current) {
              sidebarRef.current.style.transition = 'transform 0.22s cubic-bezier(0.4,0,1,1), opacity 0.22s'
              sidebarRef.current.style.transform = 'translateX(100%)'
              sidebarRef.current.style.opacity = '0'
            }
            setTimeout(() => {
              onClose()
            }, 220)
          } else {
            // Snap back smoothly
            if (sidebarRef.current) {
              sidebarRef.current.style.transition = 'transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s'
              sidebarRef.current.style.transform = 'translateX(0)'
              sidebarRef.current.style.opacity = '1'
            }
          }

          touchStartX.current = null
          dragX.current = 0
          isDragging.current = false
        }}
      >

        {/* ── Header — status color ── */}
        <div style={{ padding:'14px 16px', background:headerBg, display:'flex', alignItems:'flex-start', gap:'10px', flexShrink:0 }}>
          <button
            onClick={handleClose}
            style={{ width:'26px', height:'26px', borderRadius:'6px', border:'0.5px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', flexShrink:0, cursor:'pointer' }}
          >✕</button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'15px', fontWeight:500, color:'white' }}>{job.job_no}</div>
            <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.5)', marginTop:'2px' }}>
              {job.client}{job.shipping_line ? ` · ${job.shipping_line}` : ''}
            </div>
            <div style={{ display:'flex', gap:'4px', marginTop:'6px', flexWrap:'wrap', alignItems:'center' }}>
              {job.mode && (
                <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 7px', borderRadius:'9999px', fontSize:'10px', fontWeight:500, background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.8)', border:'0.5px solid rgba(255,255,255,0.15)' }}>
                  {job.mode}
                </span>
              )}
              <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 7px', borderRadius:'9999px', fontSize:'10px', fontWeight:500, background:'rgba(255,255,255,0.18)', color:'white', border:'0.5px solid rgba(255,255,255,0.25)' }}>
                {isDetention ? '⚠ Detention Risk' : (td.statusText || 'Not Updated')}
              </span>
              {td.dpdFlag && (
                <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 7px', borderRadius:'9999px', fontSize:'10px', fontWeight:500, background:'rgba(255,255,255,0.18)', color:'white', border:'0.5px solid rgba(255,255,255,0.25)' }}>
                  DPD
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Container nav ── */}
        {isMobile ? (
          // Mobile — compact grid of shortened chips
          <div style={{ padding:'8px 12px', borderBottom:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-secondary)', flexShrink:0 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'4px' }}>
              {cnList.map((c, i) => {
                const ctd = trackingData[c] || {}
                const cDet = (ctd.freeDays ?? 99) <= 2
                const cStatus = ctd.status || 'in_transit'
                const cEffective = cDet ? 'delayed' : cStatus
                const cSt = STATUS_STYLES_MAP[cEffective] || STATUS_STYLES_MAP['in_transit']
                const isActive = i === activeCnIdx
                return (
                  <button
                    key={c}
                    onClick={() => setActiveCnIdx(i)}
                    title={c}
                    style={{
                      fontFamily:"'JetBrains Mono',monospace",
                      fontSize:'11px', fontWeight:500,
                      padding:'8px 4px', borderRadius:'6px',
                      cursor:'pointer', textAlign:'center',
                      background: isActive ? headerBg : cDet ? '#FCEBEB' : cSt.bg,
                      color: isActive ? 'white' : cDet ? '#A32D2D' : cSt.color,
                      border: `0.5px solid ${isActive ? headerBg : cDet ? '#F7C1C1' : cSt.border}`,
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                    }}
                  >{c}</button>
                )
              })}
            </div>
          </div>
        ) : (
          // Desktop — arrow nav
          <div style={{ padding:'8px 12px', borderBottom:'0.5px solid var(--color-border-tertiary)', display:'flex', alignItems:'center', gap:'5px', background:'var(--color-background-secondary)', flexShrink:0 }}>
            <button
              onClick={() => setActiveCnIdx(i => Math.max(0, i - 1))}
              disabled={activeCnIdx === 0}
              style={{ width:'24px', height:'24px', borderRadius:'6px', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-primary)', color:'var(--color-text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', opacity: activeCnIdx === 0 ? 0.3 : 1, cursor: activeCnIdx === 0 ? 'default' : 'pointer' }}
            >{'<'}</button>
            <div ref={tabsRef} style={{ flex:1, display:'flex', gap:'4px', overflowX:'auto', scrollbarWidth:'none' }}>
              {cnList.map((c, i) => {
                const ctd = trackingData[c] || {}
                const cStatus = ctd.status || 'in_transit'
                const cDet = (ctd.freeDays ?? 99) <= 2
                const cEffective = cDet ? 'delayed' : cStatus
                const cSt = STATUS_STYLES_MAP[cEffective] || STATUS_STYLES_MAP['in_transit']
                const isActive = i === activeCnIdx
                return (
                  <button
                    key={c}
                    ref={i === activeCnIdx ? activeTabRef : null}
                    onClick={() => setActiveCnIdx(i)}
                    style={{
                      fontFamily:"'JetBrains Mono',monospace", fontSize:'10px', fontWeight:500,
                      padding:'3px 8px', borderRadius:'5px', whiteSpace:'nowrap', cursor:'pointer', flexShrink:0,
                      background: isActive ? headerBg : 'var(--color-background-primary)',
                      color: isActive ? 'white' : cDet ? '#A32D2D' : 'var(--color-text-secondary)',
                      border: isActive ? `0.5px solid ${headerBg}` : cDet ? '0.5px solid #F7C1C1' : '0.5px solid var(--color-border-tertiary)',
                    }}
                  >{c}</button>
                )
              })}
            </div>
            <button
              onClick={() => setActiveCnIdx(i => Math.min(cnList.length - 1, i + 1))}
              disabled={activeCnIdx === cnList.length - 1}
              style={{ width:'24px', height:'24px', borderRadius:'6px', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-primary)', color:'var(--color-text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', opacity: activeCnIdx === cnList.length - 1 ? 0.3 : 1, cursor: activeCnIdx === cnList.length - 1 ? 'default' : 'pointer' }}
            >{'>'}</button>
            <span style={{ fontSize:'10px', color:'var(--color-text-secondary)', flexShrink:0 }}>{activeCnIdx + 1}/{cnList.length}</span>
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div
  style={{ flex:1, overflowY:'auto', overscrollBehavior:'contain' }}
  onTouchMove={e => {
    if (window.innerWidth >= 768) return
    const touch = e.touches[0]
    if (!touch || touchStartX.current === null) return
    const deltaX = Math.abs(touch.clientX - touchStartX.current)
    const deltaY = Math.abs(touch.clientY - touchStartY.current)
    if (deltaY > deltaX) {
      e.stopPropagation()
    }
  }}
>

          {/* Container hero + free days */}
          <div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'10px' }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'16px', fontWeight:500, color:'var(--color-text-primary)' }}>{cn}</span>

              <button
                onClick={async () => { setRefreshing(true); try { await onRefresh(job, cn) } finally { setRefreshing(false) } }}
                disabled={refreshing}
                style={{ background:'none', border:'none', color:'var(--color-text-secondary)', cursor:'pointer', padding:0, lineHeight:1, fontSize:'16px' }}
                onMouseEnter={e => { e.currentTarget.style.color = headerBg }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                title="Refresh"
              >
                <span style={{ display:'inline-block', animation: refreshing ? 'spin 0.7s linear infinite' : 'none', fontSize:'18px', verticalAlign:'middle' }}>↻</span>
              </button>

              {isMobile && (
                <button
                  onClick={() => openCarrierTracking(cn, job.shipping_line, showToast)}
                  style={{ marginLeft:'auto', width:'28px', height:'28px', borderRadius:'6px', border:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-secondary)', color:'var(--color-text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'15px', cursor:'pointer' }}
                  onTouchStart={e => { e.currentTarget.style.background = headerBg; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = headerBg }}
                  onTouchEnd={e => { e.currentTarget.style.background = 'var(--color-background-secondary)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border-tertiary)' }}
                  title="Track on carrier site"
                >🌐</button>
              )}

              {!isMobile && td.lastUpdate && (
                <span style={{ fontSize:'10px', color:'var(--color-text-secondary)', fontStyle:'italic' }}>
                  Last refreshed: {new Date(td.lastUpdate).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata' })}
                </span>
              )}

              {!isMobile && (
                <button
                  onClick={() => openCarrierTracking(cn, job.shipping_line, showToast)}
                  style={{ marginLeft:'auto', width:'36px', height:'36px', borderRadius:'8px', border:`0.5px solid ${headerBg}`, background:'transparent', color:headerBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', cursor:'pointer', flexShrink:0 }}
                  onMouseEnter={e => { e.currentTarget.style.background = headerBg; e.currentTarget.style.color = 'white' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = headerBg }}
                  title="Track on carrier site"
                >🌐</button>
              )}

              <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px', borderRadius:'9999px', fontSize:'10px', fontWeight:500, background: isDetention ? '#FCEBEB' : st.bg, color: isDetention ? '#791F1F' : st.color, border:`0.5px solid ${isDetention ? '#F7C1C1' : st.border}` }}>
                {isDetention ? '⚠ Detention' : (td.statusText || 'Not Updated')}
              </span>
            </div>

            {isMobile && td.lastUpdate && (
              <div style={{ fontSize:'10px', color:'var(--color-text-secondary)', fontStyle:'italic', marginBottom:'10px' }}>
                Last refreshed: {new Date(td.lastUpdate).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata' })}
              </div>
            )}

            {!isMobile && td.freeDays == null && td.portIn && (
              <div style={{ background: '#fffbeb', border: '0.5px solid #FAC775', borderRadius: '8px', padding: '10px 12px', marginTop: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#854F0B' }}>
                  ⚠ Free days not set
                </div>
              </div>
            )}

            {!isMobile && td.freeDays != null && (
              <div style={{ background: isDetention ? '#FCEBEB' : '#EAF3DE', border:`0.5px solid ${isDetention ? '#F7C1C1' : '#C0DD97'}`, borderRadius:'8px', padding:'10px 12px', marginTop:'10px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                  <span style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em', color: isDetention ? '#791F1F' : '#27500A' }}>Free days remaining</span>
                  <span style={{ fontSize:'20px', fontWeight:500, color: isDetention ? '#A32D2D' : '#0F6E56', lineHeight:1 }}>{td.freeDays} days</span>
                </div>
                <div style={{ height:'4px', background: isDetention ? 'rgba(162,45,45,0.2)' : 'rgba(15,110,86,0.2)', borderRadius:'4px', overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:'4px', width:`${freePct}%`, background: isDetention ? '#E24B4A' : '#1D9E75' }} />
                </div>
                {detentionDate && (
                  <div style={{ fontSize:'10px', color: isDetention ? '#A32D2D' : '#3B6D11', marginTop:'4px', fontWeight: isDetention ? 500 : 400 }}>
                    {isDetention ? `⚠ Arrange delivery immediately — detention from ${detentionDate}` : `Detention from ${detentionDate}`}
                  </div>
                )}
              </div>
            )}

            {!isMobile && isDetention && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:'7px', padding:'8px 10px', borderRadius:'7px', marginTop:'8px', background:'#FCEBEB', border:'0.5px solid #F7C1C1' }}>
                <span style={{ fontSize:'13px', flexShrink:0, marginTop:'1px' }}>🚨</span>
                <span style={{ fontSize:'11px', fontWeight:500, color:'#791F1F', lineHeight:1.4 }}>Only {td.freeDays} free day{td.freeDays !== 1 ? 's' : ''} left — contact client and arrange transport today</span>
              </div>
            )}
            {!isMobile && !isDetention && td.dpdFlag && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:'7px', padding:'8px 10px', borderRadius:'7px', marginTop:'8px', background:'#EAF3DE', border:'0.5px solid #C0DD97' }}>
                <span style={{ fontSize:'13px', flexShrink:0, marginTop:'1px' }}>✅</span>
                <span style={{ fontSize:'11px', fontWeight:500, color:'#27500A', lineHeight:1.4 }}>DPD applicable — eligible for direct port delivery</span>
              </div>
            )}
            {!isMobile && status === 'customs_hold' && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:'7px', padding:'8px 10px', borderRadius:'7px', marginTop:'8px', background:'#FAEEDA', border:'0.5px solid #FAC775' }}>
                <span style={{ fontSize:'13px', flexShrink:0, marginTop:'1px' }}>🔒</span>
                <span style={{ fontSize:'11px', fontWeight:500, color:'#633806', lineHeight:1.4 }}>Container under customs hold — check examination status</span>
              </div>
            )}
          </div>

          {/* Location & Vessel */}
          <div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-secondary)', borderLeft:'3px solid #185FA5' }}>
            <div style={{ fontSize:'11px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--color-text-secondary)', marginBottom:'8px', display:'flex', alignItems:'center', gap:'5px' }}>
              Location & vessel
              <span style={{ flex:1, height:'0.5px', background:'var(--color-border-tertiary)', display:'block' }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              {[
                { label:'Current location', value: td.currentLocation, full: false },
                { label:'Terminal',         value: td.terminal,        full: false },
                { label:'Vessel',           value: td.vessel || job.vessel },
                { label:'Vessel arrival',   value: formatD(td.eta || job.eta) },
                { label:'Shipping line',    value: td.shippingLineLdb || job.shipping_line },
                { label:'Vessel IMO',       value: td.vesselImo,       mono: true, muted: true },
                ...(isMobile ? [
                  { label:'Free Days', value: td.freeDays != null ? `${td.freeDays} days${isDetention ? ' ⚠' : ''}` : null },
                  { label:'Detention from', value: detentionDate || null, color: isDetention ? '#dc2626' : td.freeDays != null && td.freeDays <= 5 ? '#b45309' : null },
                  { label:'DPD', value: td.dpdFlag ? '✓ Yes' : td.dpdFlag === false ? 'No' : null, ok: td.dpdFlag },
                ] : []),
              ].map(f => (
                <div key={f.label} style={f.full ? { gridColumn:'1/-1' } : {}}>
                  <div style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--color-text-secondary)', marginBottom:'4px' }}>{f.label}</div>
                    <div style={{ color: f.color || (f.muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)'), fontFamily: f.mono ? "'JetBrains Mono',monospace" : 'inherit', fontSize:'13px', fontWeight: f.color ? 500 : 'inherit' }}>
                    {f.value || '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Container */}
          <div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--color-border-tertiary)', borderLeft:'3px solid #0F6E56' }}>
            <div style={{ fontSize:'11px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--color-text-secondary)', marginBottom:'8px', display:'flex', alignItems:'center', gap:'5px' }}>
              Container
              <span style={{ flex:1, height:'0.5px', background:'var(--color-border-tertiary)', display:'block' }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              {[
                { label:'Size',           value: td.containerSize },
                { label:'Laden / empty',  value: td.isEmpty === true ? 'Empty' : td.isEmpty === false ? 'Full / laden' : null, ok: td.isEmpty === false },
                ...(!td.dpdFlag ? [{ label:'DPD', value:'No', ok: false }] : []),
                { label:'Est. dwell end', value: td.expectedPortOut ? `~${formatD(td.expectedPortOut)}` : null, muted: true },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--color-text-secondary)', marginBottom:'4px' }}>{f.label}</div>
                    <div style={{ fontSize:'13px', fontWeight: f.ok ? 500 : 400, color: f.ok ? '#0F6E56' : f.muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>
                    {f.value || '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Port events */}
          <div style={{ padding:'14px 18px', borderBottom:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-secondary)', borderLeft:'3px solid #EF9F27' }}>
            <div style={{ fontSize:'11px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--color-text-secondary)', marginBottom:'8px', display:'flex', alignItems:'center', gap:'5px' }}>
              Port events
              <span style={{ flex:1, height:'0.5px', background:'var(--color-border-tertiary)', display:'block' }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              {[
                { label:'Port in',      value: formatDT(td.portIn) },
                { label:'Port out',     value: formatDT(td.portOut) },
                { label:'CFS gate in',  value: formatDT(td.cfsGateIn) },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize:'10px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--color-text-secondary)', marginBottom:'4px' }}>{f.label}</div>
                    <div style={{ fontSize:'13px', color: f.muted ? 'var(--color-text-secondary)' : f.value && f.value !== '—' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                    {f.value || '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Event history */}
          {td.milestones?.length > 0 && (
            <div style={{ padding:'14px 18px', borderLeft:'3px solid #534AB7' }}>
              <div style={{ fontSize:'11px', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--color-text-secondary)', marginBottom:'10px', display:'flex', alignItems:'center', gap:'5px' }}>
                Event history
                <span style={{ flex:1, height:'0.5px', background:'var(--color-border-tertiary)', display:'block' }} />
              </div>

              {isMobile ? (
                // Mobile — compressed plain text
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  {td.milestones.map((m, i) => (
                    <div key={i} style={{ fontSize:'12px', color:'var(--color-text-primary)', lineHeight:1.4, paddingBottom:'6px', borderBottom: i < td.milestones.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                      <span style={{ fontWeight:500 }}>{m.description}</span>
                      {m.location && <span style={{ color:'var(--color-text-secondary)' }}> · {m.location.split('/').pop()?.trim() || m.location}</span>}
                      {m.date && <span style={{ color:'var(--color-text-secondary)' }}> · {new Date(m.date).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata' })}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                // Desktop — full timeline with dots and connector lines
                <div>
                  {td.milestones.map((m, i) => {
                    const es = getEventStyle(m.description)
                    const ds = dotStyles[es.dot] || dotStyles.gray
                    const isLast = i === td.milestones.length - 1
                    return (
                      <div key={i} style={{ display:'flex', gap:'8px', alignItems:'flex-start', paddingBottom: isLast ? 0 : '10px' }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:'18px', flexShrink:0 }}>
                          <div style={{ width:'18px', height:'18px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:ds.bg, border:`1.5px solid ${ds.border}`, flexShrink:0 }}>
                            <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:ds.inner }} />
                          </div>
                          {!isLast && <div style={{ width:'1px', flex:1, background:'var(--color-border-tertiary)', minHeight:'10px', marginTop:'2px' }} />}
                        </div>
                        <div style={{ flex:1, minWidth:0, paddingBottom:'2px' }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'4px', marginBottom:'2px' }}>
                            <span style={{ fontSize:'11px', fontWeight:500, color: i === 0 ? es.color : 'var(--color-text-primary)' }}>{m.description}</span>
                            <div style={{ display:'flex', gap:'3px', alignItems:'center', flexShrink:0 }}>
                              {m.transportMode && (
                                <span style={{ fontSize:'8px', fontWeight:500, padding:'1px 4px', borderRadius:'9999px', background: m.transportMode === 'VESSEL' ? '#E6F1FB' : '#FAEEDA', color: m.transportMode === 'VESSEL' ? '#0C447C' : '#633806', border:`0.5px solid ${m.transportMode === 'VESSEL' ? '#B5D4F4' : '#FAC775'}` }}>
                                  {m.transportMode}
                                </span>
                              )}
                              <span style={{ fontSize:'9px', color:'var(--color-text-secondary)', whiteSpace:'nowrap' }}>
                                {m.date ? new Date(m.date).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata' }) : ''}
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize:'10px', color:'var(--color-text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.location}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </>
  )
}

function UpdateStatusModal({ container, statusOptions, onClose, onSaved, showToast }) {
  const [fields, setFields] = useState({
    status: container.status || 'in_transit',
    statusText: container.statusText || '',
    currentLocation: container.currentLocation || '',
    vessel: container.vessel || '',
    eta: container.eta || '',
    freeDays: container.freeDays ?? '',
    portIn: container.portIn || '',
    portOut: container.portOut || '',
    cfsGateIn: container.cfsGateIn || '',
    notes: container.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateContainerStatus(container.containerNo, fields)
      showToast?.('Status updated successfully', 'success')
      onSaved()
    } catch (e) {
      showToast?.('Failed to update status', 'error')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = {
    width:'100%', padding:'8px 10px', border:'1.5px solid #e2e6ed', borderRadius:'7px',
    fontSize:'13px', color:'#1a2233', outline:'none', boxSizing:'border-box',
    fontFamily:'Inter,sans-serif',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:299, cursor:'pointer' }}
      />
      <div style={{
        position:'fixed', right:0, top:0, bottom:0, width:'min(480px, 100vw)',
        background:'white', borderLeft:'1.5px solid #e2e6ed',
        zIndex:300, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.12)',
      }}>
        <div style={{ padding:'16px 20px', borderBottom:'1.5px solid #e2e6ed', background:'#f8f9fb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:'15px', fontWeight:700, color:'#1a2233' }}>Update Status</span>
          <button onClick={onClose} style={{ width:'28px', height:'28px', borderRadius:'7px', background:'white', border:'1.5px solid #e2e6ed', cursor:'pointer', fontSize:'13px', display:'flex', alignItems:'center', justifyContent:'center', color:'#4a5568' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Container Number</label>
            <input style={{ ...fieldStyle, background:'#f4f6f9', color:'#8a96a8' }} value={container.containerNo} readOnly />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Carrier</label>
            <input style={{ ...fieldStyle, background:'#f4f6f9', color:'#8a96a8' }} value={container.carrier || ''} readOnly />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Status</label>
            <select
              value={fields.status}
              onChange={e => setFields(prev => ({ ...prev, status: e.target.value }))}
              style={fieldStyle}
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Status Text</label>
            <input
              value={fields.statusText}
              onChange={e => setFields(prev => ({ ...prev, statusText: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. In Transit"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Current Location</label>
            <input
              value={fields.currentLocation}
              onChange={e => setFields(prev => ({ ...prev, currentLocation: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. JNPT, Navi Mumbai"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Vessel</label>
            <input
              value={fields.vessel}
              onChange={e => setFields(prev => ({ ...prev, vessel: e.target.value }))}
              style={fieldStyle}
              placeholder="Vessel name"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>ETA Date</label>
            <input
              type="date"
              value={fields.eta}
              onChange={e => setFields(prev => ({ ...prev, eta: e.target.value }))}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Free Days</label>
            <input
              type="number"
              value={fields.freeDays}
              onChange={e => setFields(prev => ({ ...prev, freeDays: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. 7"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Port In</label>
            <input
              value={fields.portIn}
              onChange={e => setFields(prev => ({ ...prev, portIn: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. Nhava Sheva"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Port Out</label>
            <input
              value={fields.portOut}
              onChange={e => setFields(prev => ({ ...prev, portOut: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. JNPT"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>CFS Gate In</label>
            <input
              value={fields.cfsGateIn}
              onChange={e => setFields(prev => ({ ...prev, cfsGateIn: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. CFS Nhava Sheva"
            />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Notes</label>
            <textarea
              value={fields.notes}
              onChange={e => setFields(prev => ({ ...prev, notes: e.target.value }))}
              style={{ ...fieldStyle, minHeight:'72px', resize:'vertical' }}
              placeholder="Optional notes..."
            />
          </div>
        </div>

        <div style={{ padding:'14px 20px', borderTop:'1.5px solid #e2e6ed', display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'1.5px solid #e2e6ed', background:'white', color:'#4a5568', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'none', background: saving ? '#8a96a8' : '#1a4fa0', color:'white', fontSize:'13px', fontWeight:600, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

function AddMilestoneModal({ container, onClose, onSaved, showToast }) {
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  const quickEvents = [
    'Vessel Arrived', 'Gate In', 'Customs Hold',
    'CFS Received', 'Delivery Scheduled', 'Empty Returned',
  ]

  const handleAdd = async () => {
    if (!description.trim()) {
      showToast?.('Please enter a description', 'warning')
      return
    }
    setSaving(true)
    try {
      await addMilestone(container.containerNo, {
        description: description.trim(),
        location: location.trim(),
        date: date || new Date().toISOString().slice(0, 10),
      })
      showToast?.('Milestone added successfully', 'success')
      onSaved()
    } catch (e) {
      showToast?.('Failed to add milestone', 'error')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = {
    width:'100%', padding:'8px 10px', border:'1.5px solid #e2e6ed', borderRadius:'7px',
    fontSize:'13px', color:'#1a2233', outline:'none', boxSizing:'border-box',
    fontFamily:'Inter,sans-serif',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:299, cursor:'pointer' }}
      />
      <div style={{
        position:'fixed', right:0, top:0, bottom:0, width:'min(480px, 100vw)',
        background:'white', borderLeft:'1.5px solid #e2e6ed',
        zIndex:300, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.12)',
      }}>
        <div style={{ padding:'16px 20px', borderBottom:'1.5px solid #e2e6ed', background:'#f8f9fb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:'15px', fontWeight:700, color:'#1a2233' }}>Add Milestone</span>
          <button onClick={onClose} style={{ width:'28px', height:'28px', borderRadius:'7px', background:'white', border:'1.5px solid #e2e6ed', cursor:'pointer', fontSize:'13px', display:'flex', alignItems:'center', justifyContent:'center', color:'#4a5568' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Container Number</label>
            <input style={{ ...fieldStyle, background:'#f4f6f9', color:'#8a96a8' }} value={container.containerNo} readOnly />
          </div>

          {container.milestones?.length > 0 && (
            <div>
              <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'6px' }}>Existing Milestones</label>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {container.milestones.map((m, i) => (
                  <div key={i} style={{ padding:'6px 10px', background:'#f8f9fb', border:'1px solid #e2e6ed', borderRadius:'6px', fontSize:'12px' }}>
                    <div style={{ fontWeight:600, color:'#1a2233' }}>{m.description}</div>
                    <div style={{ color:'#8a96a8', fontSize:'11px' }}>
                      {m.location && `${m.location} · `}
                      {m.date ? new Date(m.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'6px' }}>Quick Events</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {quickEvents.map(ev => (
                <button
                  key={ev}
                  onClick={() => setDescription(ev)}
                  style={{
                    padding:'5px 12px', borderRadius:'9999px', border:'1.5px solid #bfdbfe',
                    background: description === ev ? '#1a4fa0' : '#eff6ff',
                    color: description === ev ? 'white' : '#1e40af',
                    fontSize:'11px', fontWeight:600, cursor:'pointer',
                    fontFamily:'Inter,sans-serif',
                  }}
                >
                  {ev}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={fieldStyle}
              placeholder="Milestone description"
            />
          </div>

          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Location</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              style={fieldStyle}
              placeholder="e.g. JNPT, Navi Mumbai"
            />
          </div>

          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'#4a5568', display:'block', marginBottom:'4px' }}>Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={fieldStyle}
            />
          </div>
        </div>

        <div style={{ padding:'14px 20px', borderTop:'1.5px solid #e2e6ed', display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button onClick={onClose}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'1.5px solid #e2e6ed', background:'white', color:'#4a5568', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={handleAdd} disabled={saving || !description.trim()}
            style={{ padding:'8px 20px', borderRadius:'8px', border:'none', background: (saving || !description.trim()) ? '#8a96a8' : '#1a4fa0', color:'white', fontSize:'13px', fontWeight:600, cursor: (saving || !description.trim()) ? 'default' : 'pointer' }}>
            {saving ? 'Adding...' : 'Add Milestone'}
          </button>
        </div>
      </div>
    </>
  )
}

function ContainerTimeline({ container, onClose }) {
  if (!container) return null
  return (
    <div className="border-t border-[#e2e6ed] bg-white px-4 sm:px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-[#1a2233]">Milestones — {container.containerNo}</div>
        <button type="button" onClick={onClose}
          className="text-xs font-semibold text-blue-700 hover:text-blue-800">Close</button>
      </div>
      {container.milestones.length === 0 ? (
        <p className="text-xs text-[#8a96a8] py-4 text-center">No milestone data available.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-[#e2e6ed]" />
          <div className="space-y-3">
            {container.milestones.map((m, i) => (
              <div key={i} className="flex items-start gap-3 relative">
                <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 z-10 ${
                  i === container.milestones.length - 1
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-white border-[#d0d6e0]'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#1a2233]">{m.description}</p>
                  <p className="text-xs text-[#8a96a8]">
                    {m.location} · {formatContainerDate(m.date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const AUTO_FILL_CARRIERS = [
  'one', 'evergreen', 'zim', 'yang ming', 'yangming',
  'hmm', 'oocl', 'wan hai', 'wanhai', 'pil', 'sinokor',
]

function getCarrierUrl(containerNo, shippingLine) {
  const cn = (containerNo || '').trim().toUpperCase()
  const sl = (shippingLine || '').toLowerCase().trim()

  if (sl.includes('msc'))
    return `https://www.msc.com/en/track-a-shipment?agencyPath=msc&Type=Container&Information=${cn}`
  if (sl.includes('maersk'))
    return `https://www.maersk.com/tracking/${cn}`
  if (sl.includes('hapag'))
    return `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container=${cn}`
  if (sl.includes('cma'))
    return `https://www.cma-cgm.com/ebusiness/tracking/search?SearchViewModel.SearchBy=Container&SearchViewModel.Reference=${cn}`
  if (sl.includes('one'))
    return `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?ctrack-field=${cn}&trakNoParam=${cn}`
  if (sl.includes('evergreen'))
    return `https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do?TYPE=CNTR&CNTR=${cn}`
  if (sl.includes('zim'))
    return `https://www.zim.com/tools/track-a-shipment?consnumber=${cn}`
  if (sl.includes('yang ming') || sl.includes('yangming'))
    return `https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx?SearchType=CNTR_NO&strSearch=${cn}`
  if (sl.includes('hmm'))
    return `https://www.hmm21.com/cms/business/ebiz/trackTrace/trackTrace/index.jsp?trackingType=CNTR&trackingNo=${cn}`
  if (sl.includes('cosco'))
    return `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number=${cn}`
  if (sl.includes('oocl'))
    return `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?ContainerNo=${cn}`
  if (sl.includes('wan hai') || sl.includes('wanhai'))
    return `https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml?cntrNo=${cn}`
  if (sl.includes('pil'))
    return `https://www.pilship.com/en-PIL-Container-Tracking/114.html?number=${cn}`
  if (sl.includes('ts line') || sl.includes('tsline'))
    return `https://www.tslines.com/cargo_track?cntr_no=${cn}`
  if (sl.includes('interasia'))
    return `https://www.track-trace.com/container#${cn}`
  if (sl.includes('sinokor'))
    return `https://www.sinokor.co.kr/Tracking?blNo=${cn}`
  if (sl.includes('emirates'))
    return `https://scekprd.emirates.com/skychain/app?service=page%2Fnwp%3ATrackshipmt&initial=y`
  if (sl.includes('rcl') || sl.includes('regional container'))
    return `https://www.track-trace.com/container#${cn}`

  return `https://www.track-trace.com/container#${cn}`
}

function openCarrierTracking(containerNo, shippingLine, showToast) {
  const cn  = (containerNo  || '').trim().toUpperCase()
  const sl  = (shippingLine || '').toLowerCase().trim()
  const url = getCarrierUrl(cn, sl)

  const autoFill = AUTO_FILL_CARRIERS.some(c => sl.includes(c))
  if (!autoFill && cn) {
    copyToClipboard(cn, showToast, shippingLine)
  }

  const isMobile = window.innerWidth < 768

  if (isMobile) {
    window.open(url, '_blank')
  } else {
    const width  = Math.min(1200, window.screen.width  * 0.85)
    const height = Math.min(800,  window.screen.height * 0.85)
    const left   = (window.screen.width  - width)  / 2
    const top    = (window.screen.height - height) / 2
    window.open(
      url,
      `carrier_tracking_${cn}`,
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
    )
  }
}

function copyToClipboard(text, showToast, carrierName) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(`${text} copied — paste it in the ${carrierName || 'carrier'} search box`, 'success'))
      .catch(() => fallbackCopy(text, showToast, carrierName))
  } else {
    fallbackCopy(text, showToast, carrierName)
  }
}

function fallbackCopy(text, showToast, carrierName) {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (success) {
      showToast(`${text} copied — paste it in the ${carrierName || 'carrier'} search box`, 'success')
    } else {
      showToast(`${text} — type this in the ${carrierName || 'carrier'} search box`, 'info')
    }
  } catch (e) {
    showToast(`${text} — type this in the ${carrierName || 'carrier'} search box`, 'info')
  }
}

function ContainerTrackingSection({ showToast, jobs, pendingNavAction, onNavActionConsumed }) {
  const [trackingData, setTrackingData]         = useState({})
  const [loadingTracking, setLoadingTracking]   = useState(true)
  const [searchQuery, setSearchQuery]           = useState('')
  const [expandedContainers, setExpandedContainers] = useState({})
  const [detailJob, setDetailJob]               = useState(null)
  const closeSidebarRef = useRef(null)
  const [activeContainer, setActiveContainer]   = useState(null) // { jobId, cn }
  const [updateModal, setUpdateModal]           = useState(null)
  const [milestoneModal, setMilestoneModal]     = useState(null)
  const [filterLine, setFilterLine]             = useState('')
  const [filterStatus, setFilterStatus]         = useState('')

  const STATUS_OPTIONS = [
    { value: 'in_transit',     label: 'In Transit'     },
    { value: 'arrived',        label: 'Arrived'        },
    { value: 'at_cfs',         label: 'At CFS'         },
    { value: 'customs_hold',   label: 'Customs Hold'   },
    { value: 'on_rail',        label: 'On Rail'        },
    { value: 'delivered',      label: 'Delivered'      },
    { value: 'empty_returned', label: 'Empty Returned' },
    { value: 'delayed',        label: 'Delayed'        },
  ]

  const carriers = ['Maersk','MSC','Hapag-Lloyd','CMA-CGM','Evergreen','ONE','OOCL','COSCO','ZIM','HMM','Yang Ming','Wan Hai','TS Line','Interasia','Emirates','Akkon','Other']

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoadingTracking(true)
      try {
        const { data } = await supabase.from('container_tracking').select('*')
        const map = {}
        for (const row of (data || [])) {
          map[row.container_no] = {
            status:          row.status || 'in_transit',
            statusText:      row.status_text || 'In Transit',
            currentLocation: row.current_location,
            vessel:          row.vessel,
            freeDays:        row.free_days,
            notes:           row.notes,
            lastUpdate:      row.last_update,
            milestones:      row.milestones || [],
            eta:             row.eta,
            portIn:          row.port_in,
            portOut:         row.port_out,
            cfsGateIn:       row.cfs_gate_in || (() => {
              const milestones = row.milestones || []
              const cfsEvent = milestones.find(m =>
                typeof m.description === 'string' &&
                (m.description.toUpperCase().includes('CFS IN') ||
                 m.description.toUpperCase().includes('CFS GATE IN') ||
                 m.description.toUpperCase().includes('GATE IN'))
              )
              return cfsEvent?.date || null
            })(),
            terminal:        row.terminal        || null,
            dpdFlag:         row.dpd_flag        || false,
            isEmpty:         row.is_empty        || false,
            vesselImo:        row.vessel_imo        || null,
            shippingLineLdb:  row.shipping_line_ldb || null,
            containerSize:    row.container_size    || null,
            expectedPortOut:  row.expected_port_out || null,
          }
        }
        if (mounted) setTrackingData(map)
      } catch (e) {
        console.warn('Could not load tracking data:', e)
      } finally {
        if (mounted) setLoadingTracking(false)
      }

      // Auto-refresh from LDB on tab open
      if (mounted && (jobs || []).filter(j => j.containers).length > 0) {
        try {
          await refreshAllContainers(jobs, {})
          const { data: fresh } = await supabase.from('container_tracking').select('*')
          const map = {}
          for (const row of (fresh || [])) {
            map[row.container_no] = {
              status:          row.status || 'in_transit',
              statusText:      row.status_text || 'In Transit',
              currentLocation: row.current_location,
              vessel:          row.vessel,
              freeDays:        row.free_days,
              notes:           row.notes,
              lastUpdate:      row.last_update,
              milestones:      row.milestones || [],
              eta:             row.eta,
              portIn:          row.port_in,
              portOut:         row.port_out,
              cfsGateIn:       row.cfs_gate_in || (() => {
                const milestones = row.milestones || []
                const cfsEvent = milestones.find(m =>
                  typeof m.description === 'string' &&
                  (m.description.toUpperCase().includes('CFS IN') ||
                   m.description.toUpperCase().includes('CFS GATE IN') ||
                   m.description.toUpperCase().includes('GATE IN'))
                )
                return cfsEvent?.date || null
              })(),
              terminal:        row.terminal        || null,
              dpdFlag:         row.dpd_flag        || false,
              isEmpty:         row.is_empty        || false,
              vesselImo:       row.vessel_imo      || null,
              shippingLineLdb: row.shipping_line_ldb || null,
              containerSize:   row.container_size  || null,
              expectedPortOut: row.expected_port_out || null,
            }
          }
          if (mounted) setTrackingData(map)
        } catch (e) {
          console.warn('Auto-refresh failed:', e)
        }
      }
    }
    load()
    return () => { mounted = false }
  }, [jobs])

  const refreshTracking = async () => {
    const { data } = await supabase.from('container_tracking').select('*')
    const map = {}
    for (const row of (data || [])) {
      map[row.container_no] = {
        status:          row.status || 'in_transit',
        statusText:      row.status_text || 'In Transit',
      currentLocation: row.current_location,
          vessel:          row.vessel,
          freeDays:        row.free_days,
          notes:           row.notes,
          lastUpdate:      row.last_update,
          milestones:      row.milestones || [],
          eta:             row.eta,
          portIn:          row.port_in,
          portOut:         row.port_out,
          cfsGateIn:       row.cfs_gate_in || (() => {
            const milestones = row.milestones || []
            const cfsEvent = milestones.find(m =>
              typeof m.description === 'string' &&
              (m.description.toUpperCase().includes('CFS IN') ||
               m.description.toUpperCase().includes('CFS GATE IN') ||
               m.description.toUpperCase().includes('GATE IN'))
            )
            return cfsEvent?.date || null
          })(),
          terminal:        row.terminal        || null,
          dpdFlag:         row.dpd_flag        || false,
          isEmpty:         row.is_empty        || false,
          vesselImo:        row.vessel_imo        || null,
          shippingLineLdb:  row.shipping_line_ldb || null,
          containerSize:    row.container_size    || null,
          expectedPortOut:  row.expected_port_out || null,
        }
      }
      setTrackingData(map)
    }

  const parseContainers = (str) => {
    if (!str || typeof str !== 'string') return []
    return str.split(/[\s,;/]+/).map(s => s.trim().toUpperCase()).filter(s => s.length >= 4)
  }

  // One entry per job that has containers
  const allJobCards = useMemo(() => {
    return (jobs || [])
      .map(job => ({ job, cnList: parseContainers(job.containers) }))
      .filter(({ cnList }) => cnList.length > 0)
  }, [jobs])

  const filteredJobCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return allJobCards.filter(({ job, cnList }) => {
      if (filterLine && job.shipping_line !== filterLine) return false
      if (filterStatus) {
        if (filterStatus === 'detained') {
          const anyDetained = cnList.some(cn => (trackingData[cn]?.freeDays ?? 99) <= 2)
          if (!anyDetained) return false
        } else {
          const anyMatch = cnList.some(cn => (trackingData[cn]?.status || 'in_transit') === filterStatus)
          if (!anyMatch) return false
        }
      }
      if (!q) return true
      return (
        (job.job_no  || '').toLowerCase().includes(q) ||
        (job.client  || '').toLowerCase().includes(q) ||
        (job.bl_no   || '').toLowerCase().includes(q) ||
        cnList.some(cn => cn.toLowerCase().includes(q))
      )
    })
  }, [allJobCards, searchQuery, filterLine, filterStatus, trackingData])

  const totalContainerCount = allJobCards.reduce((s, { cnList }) => s + cnList.length, 0)

  const statusProgress = (status) => {
    if (status === 'delivered' || status === 'empty_returned') return 100
    if (status === 'at_cfs')       return 85
    if (status === 'arrived')      return 75
    if (status === 'customs_hold') return 70
    if (status === 'on_rail')      return 90
    if (status === 'delayed')      return 45
    return 55
  }

  const getProgressColor = (status, freeDays) => {
    if (freeDays != null && freeDays <= 2) return '#dc2626'
    if (['delivered','arrived','at_cfs','on_rail'].includes(status)) return '#16a34a'
    if (['customs_hold','delayed'].includes(status)) return '#dc2626'
    return '#f59e0b'
  }

  const formatD = (d) => d
    ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : '\u2014'

  const STATUS_STYLES_MAP = {
    in_transit:     { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
    arrived:        { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
    at_cfs:         { bg:'#f0fdfa', color:'#0f766e', border:'#99f6e4' },
    customs_hold:   { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
    on_rail:        { bg:'#eef2ff', color:'#3730a3', border:'#c7d2fe' },
    delivered:      { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
    empty_returned: { bg:'#f9fafb', color:'#4a5568', border:'#d0d6e0' },
    delayed:        { bg:'#fef2f2', color:'#991b1b', border:'#fecaca' },
  }

  const ensureTrackingRow = async (job, cn) => {
    if (trackingData[cn]) return
    await supabase.from('container_tracking').upsert({
      container_no:     cn,
      job_no:           job.job_no,
      job_id:           job.id,
      carrier:          job.shipping_line || null,
      status:           'in_transit',
      status_text:      'In Transit',
      vessel:           job.vessel || null,
      eta:              job.eta || null,
      free_days:        job.free_days || null,
      last_update:      new Date().toISOString(),
      milestones:       [],
    }, { onConflict: 'container_no' })
    await refreshTracking()
  }

  const handleOpenUpdate = async (job, cn) => {
    await ensureTrackingRow(job, cn)
    const carrier = job.shipping_line || ''

    try {
      showToast(`Fetching LDB status for ${cn}...`, 'info')
      const result = await fetchLDBTracking(cn)
      if (result.ok) {
        await persistLDBTracking(cn, job, result.data)
        showToast(`${cn} updated from LDB`, 'success')
      } else {
        showToast(result.userMessage || `No LDB data for ${cn}`, 'info')
      }
    } catch (e) {
      showToast(`LDB unavailable for ${cn}`, 'info')
    }

    const { data: freshRow } = await supabase
      .from('container_tracking')
      .select('*')
      .eq('container_no', cn)
      .single()

    await refreshTracking()

    const td = freshRow ? {
      status:          freshRow.status          || 'in_transit',
      statusText:      freshRow.status_text     || 'In Transit',
      currentLocation: freshRow.current_location || '',
      vessel:          freshRow.vessel          || '',
      eta:             freshRow.eta             || '',
      freeDays:        freshRow.free_days       ?? '',
      notes:           freshRow.notes          || '',
      portIn:          freshRow.port_in         || '',
      portOut:         freshRow.port_out        || '',
      cfsGateIn:       freshRow.cfs_gate_in     || '',
    } : {}

    setUpdateModal({
      containerNo:     cn,
      carrier:         carrier,
      status:          td.status          || 'in_transit',
      statusText:      td.statusText      || 'In Transit',
      currentLocation: td.currentLocation || '',
      vessel:          td.vessel          || job.vessel || '',
      eta:             (td.eta            || job.eta || '').slice(0, 10),
      freeDays:        td.freeDays        ?? job.free_days ?? '',
      notes:           td.notes          || '',
      portIn:          td.portIn         || '',
      portOut:         td.portOut        || '',
      cfsGateIn:       td.cfsGateIn      || '',
    })
  }

  const handleOpenMilestone = async (job, cn) => {
    await ensureTrackingRow(job, cn)
    const td = trackingData[cn] || {}
    setMilestoneModal({ containerNo: cn, milestones: td.milestones || [] })
  }

  // ── KPI calculations ─────────────────────────── MUST be before early return
  const kpis = useMemo(() => {
    let inTransit = 0, atCFS = 0, detained = 0, arrivingThisWeek = 0
    const today = new Date()
    const weekOut = new Date(); weekOut.setDate(today.getDate() + 7)
    for (const { cnList } of allJobCards) {
      for (const cn of cnList) {
        const td = trackingData[cn] || {}
        const status = td.status || 'in_transit'
        if (td.freeDays != null && td.freeDays <= 2) detained++
        else if (status === 'in_transit')  inTransit++
        else if (status === 'at_cfs' || status === 'arrived') atCFS++
        const eta = td.eta || null
        if (eta) {
          const etaD = new Date(eta)
          if (etaD >= today && etaD <= weekOut) arrivingThisWeek++
        }
      }
    }
    return { inTransit, atCFS, detained, arrivingThisWeek, total: totalContainerCount }
  }, [allJobCards, trackingData, totalContainerCount])

  const sortedJobCards = useMemo(() => {
    return [...filteredJobCards].sort((a, b) => {
      const na = parseInt((a.job.job_no || '').replace(/\D/g, '')) || 0
      const nb = parseInt((b.job.job_no || '').replace(/\D/g, '')) || 0
      return nb - na
    })
  }, [filteredJobCards])

  useEffect(() => {
    if (!searchQuery.trim()) return
    const q = searchQuery.trim().toLowerCase()
    const toExpand = {}
    for (const { job, cnList } of allJobCards) {
      const containerMatch = cnList.some(cn => cn.toLowerCase().includes(q))
      if (containerMatch) toExpand[`job_${job.id}`] = true
    }
    if (Object.keys(toExpand).length > 0) {
      setExpandedContainers(prev => ({ ...prev, ...toExpand }))
    }
  }, [searchQuery, allJobCards])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && detailJob && window.innerWidth >= 768) {
        if (closeSidebarRef.current) closeSidebarRef.current()
        else { setDetailJob(null); setActiveContainer(null) }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailJob])

  useEffect(() => {
    if (!pendingNavAction || pendingNavAction.tab !== 'containers') return
    if (!pendingNavAction.jobId || !pendingNavAction.cn) return
    if (jobs.length === 0) return

    const job = jobs.find(j => j.id === pendingNavAction.jobId)
    if (!job) return

    setActiveContainer({ jobId: pendingNavAction.jobId, cn: pendingNavAction.cn })
    setDetailJob(job)
    onNavActionConsumed?.()
  }, [pendingNavAction, jobs])

  if (loadingTracking) return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ background:'var(--color-background-primary)', border:'0.5px solid var(--color-border-tertiary)', borderRadius:'12px', padding:'16px' }}>
          <div style={{ height:'16px', width:'120px', background:'var(--color-border-tertiary)', borderRadius:'6px' }} />
          <div style={{ height:'36px', background:'var(--color-border-tertiary)', borderRadius:'8px', marginTop:'10px' }} />
        </div>
      ))}
    </div>
  )

  // ── Shared refresh handler ────────────────────────────────────────
  const handleRefreshAll = async () => {
    showToast('Fetching live tracking from LDB...', 'info')
    try {
      const totals = await forceRefreshAllContainers(
        jobs,
        (msg) => showToast(msg, 'info'),
      )
      await refreshTracking()
      if (totals.updated === 0 && totals.failed === 0) {
        showToast(`All containers refreshed — no updates available from LDB.`, 'info')
      } else if (totals.failed > 0) {
        showToast(
          `Updated ${totals.updated}, skipped ${totals.skipped}, failed ${totals.failed} container(s). Check console for details.`,
          'error',
        )
      } else {
        showToast(
          `LDB refresh complete. ${totals.updated} updated, ${totals.skipped} skipped (outdated/no data).`,
          'success',
        )
      }
    } catch (err) {
      console.error('[LDB] handleRefreshAll error:', err)
      showToast('LDB refresh failed. Check your connection.', 'error')
    }
  }

  const handleLDBRefresh = async (job, cn) => {
    showToast(`Refreshing ${cn} from LDB...`, 'info')
    try {
      const result = await fetchLDBTracking(cn)
      if (result.ok) {
        await persistLDBTracking(cn, job, result.data)
        await refreshTracking()
        showToast(`${cn} refreshed ✓`, 'success')
      } else {
        showToast(result.userMessage || `No LDB data for ${cn}`, 'info')
      }
    } catch (err) {
      showToast(`LDB unavailable for ${cn}`, 'info')
    }
  }

  // ── Shared props passed to both views ────────────────────────────
  const sharedProps = {
    sortedJobCards,
    trackingData,
    searchQuery, setSearchQuery,
    filterLine,  setFilterLine,
    filterStatus, setFilterStatus,
    carriers,
    STATUS_OPTIONS,
    expandedContainers, setExpandedContainers,
    setDetailJob,
    handleOpenUpdate,
    openCarrierTracking,
    statusProgress,
    getProgressColor,
    STATUS_STYLES_MAP,
    kpis,
    showToast,
    refreshAll: handleRefreshAll,
    activeContainer,
    setActiveContainer,
    handleLDBRefresh,
    handleChipClick: (jobId, cn, job) => {
      if (activeContainer?.jobId === jobId && activeContainer?.cn === cn) {
        if (closeSidebarRef.current) closeSidebarRef.current()
        else { setDetailJob(null); setActiveContainer(null) }
      } else {
        setActiveContainer({ jobId, cn })
        setDetailJob(job)
      }
    },
  }

  return (
    <div
      onDoubleClick={e => {
        if (window.innerWidth < 768) return
        if (!detailJob) return
        const sidebar = document.querySelector('[data-sidebar="container-detail"]')
        const jobCards = document.querySelector('[data-area="job-cards"]')
        if (sidebar && sidebar.contains(e.target)) return
        if (jobCards && jobCards.contains(e.target)) return
        if (closeSidebarRef.current) closeSidebarRef.current()
        else { setDetailJob(null); setActiveContainer(null) }
      }}
      style={{ minHeight:'100vh' }}
    >
      {/* Mobile — hidden on md+ */}
      <div className="block md:hidden">
        <ContainerTrackingMobile {...sharedProps} />
      </div>

      {/* Desktop — hidden below md */}
      <div className="hidden md:block">
        <ContainerTrackingDesktop {...sharedProps} />
      </div>

      {/* Modals — shared */}
      {updateModal && (
        <UpdateStatusModal
          container={updateModal}
          statusOptions={STATUS_OPTIONS}
          onClose={() => setUpdateModal(null)}
          onSaved={async () => { setUpdateModal(null); await refreshTracking() }}
          showToast={showToast}
        />
      )}
      {milestoneModal && (
        <AddMilestoneModal
          container={milestoneModal}
          onClose={() => setMilestoneModal(null)}
          onSaved={async () => { setMilestoneModal(null); await refreshTracking() }}
          showToast={showToast}
        />
      )}
      {detailJob && (
        <JobDetailPanel
            job={detailJob}
            trackingData={trackingData}
            showToast={showToast}
            activeContainer={activeContainer?.cn || null}
            onClose={() => { setDetailJob(null); setActiveContainer(null) }}
            onCloseRef={closeSidebarRef}

            onUpdate={(job, cn) => { setDetailJob(null); setActiveContainer(null); handleOpenUpdate(job, cn) }}
            onAddEvent={(job, cn) => { setDetailJob(null); setActiveContainer(null); handleOpenMilestone(job, cn)       }}
            onRefresh={handleLDBRefresh}
          />
      )}
    </div>
  )
}

export default ContainerTrackingSection
