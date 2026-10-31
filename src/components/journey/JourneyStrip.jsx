// The journey of a job as a row of steps: ✓ done, ● current, ○ to come.
// steps come from journeyFor(job, data).steps
// Portal colour tokens, so it follows light / dark mode (fallbacks: the old light colours)
const C = {
  green: 'var(--green, #059669)', greenBg: 'var(--green-bg, #ecfdf5)', navy: 'var(--navy, #1a4fa0)', navy50: 'var(--navy-50, #e8eef8)',
  faint: 'var(--faint, #b8c1cf)', surface3: 'var(--surface-3, #f4f6f9)', text: 'var(--text, #1a2233)', text2: 'var(--text-2, #5b6678)',
  muted: 'var(--muted, #8a96a8)', line2: 'var(--line-2, #d0d6e0)',
}
export default function JourneyStrip({ steps, compact }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: compact ? '4px' : '6px', flexWrap: 'wrap', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {steps.map((s, i) => {
        const color = s.done ? C.green : s.current ? C.navy : C.faint
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: compact ? '4px' : '6px' }}>
            <div style={{ minWidth: compact ? '70px' : '92px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  width: compact ? '18px' : '22px', height: compact ? '18px' : '22px', borderRadius: '50%', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: compact ? '11px' : '12px', fontWeight: 700,
                  background: s.done ? C.greenBg : s.current ? C.navy50 : C.surface3,
                  color, border: `1.5px solid ${color}`,
                }}>
                  {s.done ? '✓' : s.current ? '●' : ''}
                </span>
                <span style={{ fontSize: compact ? '12px' : '13px', fontWeight: s.current ? 700 : 600, color: s.done || s.current ? C.text : C.muted }}>
                  {s.label}
                </span>
              </div>
              {(s.when || s.sub) && (
                <div style={{ fontSize: '11px', color: C.text2, marginLeft: compact ? '24px' : '28px', marginTop: '2px', lineHeight: 1.4 }}>
                  {s.when}{s.when && s.sub ? ' · ' : ''}{s.sub}
                </div>
              )}
            </div>
            {i < steps.length - 1 && (
              <span style={{ color: C.line2, fontSize: compact ? '12px' : '14px', marginTop: compact ? '1px' : '2px' }}>→</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
