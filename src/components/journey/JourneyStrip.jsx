// The journey of a job as a row of steps: ✓ done, ● current, ○ to come.
// steps come from journeyFor(job, data).steps
export default function JourneyStrip({ steps, compact }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: compact ? '4px' : '6px', flexWrap: 'wrap', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {steps.map((s, i) => {
        const color = s.done ? '#059669' : s.current ? '#1a4fa0' : '#b8c1cf'
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: compact ? '4px' : '6px' }}>
            <div style={{ minWidth: compact ? '70px' : '92px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  width: compact ? '18px' : '22px', height: compact ? '18px' : '22px', borderRadius: '50%', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: compact ? '11px' : '12px', fontWeight: 700,
                  background: s.done ? '#ecfdf5' : s.current ? '#e8eef8' : '#f4f6f9',
                  color, border: `1.5px solid ${color}`,
                }}>
                  {s.done ? '✓' : s.current ? '●' : ''}
                </span>
                <span style={{ fontSize: compact ? '12px' : '13px', fontWeight: s.current ? 700 : 600, color: s.done || s.current ? '#1a2233' : '#8a96a8' }}>
                  {s.label}
                </span>
              </div>
              {(s.when || s.sub) && (
                <div style={{ fontSize: '11px', color: '#5b6678', marginLeft: compact ? '24px' : '28px', marginTop: '2px', lineHeight: 1.4 }}>
                  {s.when}{s.when && s.sub ? ' · ' : ''}{s.sub}
                </div>
              )}
            </div>
            {i < steps.length - 1 && (
              <span style={{ color: '#d0d6e0', fontSize: compact ? '12px' : '14px', marginTop: compact ? '1px' : '2px' }}>→</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
