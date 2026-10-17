import { useState } from 'react'
import UlipCheck from './UlipCheck'
import { LOOKUP_CATEGORIES } from './ulipChecks'

// "Quick Lookup": check any number against government systems without
// opening a job. Pick what you have (BE, shipping bill, truck, IEC ...),
// type it, press the button.
export default function QuickLookup() {
  const [catId, setCatId] = useState(LOOKUP_CATEGORIES[0].id)
  const cat = LOOKUP_CATEGORIES.find((c) => c.id === catId) || LOOKUP_CATEGORIES[0]

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a2233' }}>Quick Lookup</div>
        <div style={{ fontSize: '14px', color: '#5b6678', marginTop: '4px' }}>
          Check any number with government systems (ICEGATE, ports, FASTag, VAHAN and more). No job needed.
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
        {LOOKUP_CATEGORIES.map((c) => {
          const active = c.id === catId
          return (
            <button key={c.id} type="button" onClick={() => setCatId(c.id)}
              style={{
                height: '42px', padding: '0 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${active ? '#1a4fa0' : '#e2e6ed'}`, background: active ? '#1a4fa0' : 'white', color: active ? 'white' : '#1a2233',
              }}>
              {c.icon} {c.label}
            </button>
          )
        })}
      </div>

      {cat.description && <div style={{ fontSize: '13px', color: '#5b6678', marginBottom: '12px' }}>{cat.description}</div>}

      <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '900px' }}>
        {cat.checks.map((c) => <UlipCheck key={`${c.api}-${c.title}`} check={c} job={null} />)}
      </div>
    </div>
  )
}
