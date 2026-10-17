import { useMemo, useState } from 'react'

// A ULIP answer table that never pushes the page down. Long lists (an IGM can
// hold hundreds of containers for many importers) scroll inside a fixed-height
// box with a sticky header. A search box appears for long lists, and rows that
// mention one of this job's containers (or numbers) are pinned to the top.
export default function ResultTable({ table, highlight = [], labelStyle }) {
  const [q, setQ] = useState('')
  const marks = useMemo(() => highlight.map((h) => String(h).toUpperCase()).filter((h) => h.length >= 4), [highlight])

  const rows = useMemo(() => {
    const isMine = (r) => marks.length > 0 && r.some((v) => v != null && marks.includes(String(v).toUpperCase().trim()))
    const tagged = table.rows.map((r, i) => ({ r, i, mine: isMine(r) }))
    const needle = q.trim().toUpperCase()
    const filtered = needle ? tagged.filter(({ r }) => r.some((v) => v != null && String(v).toUpperCase().includes(needle))) : tagged
    return [...filtered.filter((x) => x.mine), ...filtered.filter((x) => !x.mine)]
  }, [table.rows, marks, q])

  const total = table.rows.length
  const mineCount = rows.filter((x) => x.mine).length
  const long = total > 8

  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={labelStyle}>{table.title} · {total}</div>
        {mineCount > 0 && (
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a4fa0', background: '#eef3fb', borderRadius: '6px', padding: '2px 8px' }}>
            {mineCount} on this job, shown first
          </span>
        )}
      </div>
      {long && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search this list (container, item no, name…)"
          style={{ width: '100%', marginTop: '6px', height: '34px', border: '1px solid #e2e6ed', borderRadius: '8px', padding: '0 10px', fontSize: '13px', boxSizing: 'border-box' }}
        />
      )}
      <div style={{ overflow: 'auto', maxHeight: long ? '320px' : 'none', marginTop: '6px', border: '1px solid #e2e6ed', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px' }}>
          <thead>
            <tr>{table.columns.map((c, ci) => <th key={ci} style={th}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(({ r, i, mine }) => (
              <tr key={i} style={mine ? { background: '#eef3fb' } : undefined}>
                {r.map((v, ci) => <td key={ci} style={{ ...td, fontWeight: mine ? 600 : 400 }}>{v ?? '—'}</td>)}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={table.columns.length} style={{ ...td, color: '#8a96a8' }}>Nothing matches “{q}”</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {long && (
        <div style={{ fontSize: '12px', color: '#8a96a8', marginTop: '4px' }}>
          {q ? `${rows.length} of ${total} match` : `Scroll inside the box to see all ${total}`}
        </div>
      )}
    </div>
  )
}

const th = { position: 'sticky', top: 0, zIndex: 1, textAlign: 'left', padding: '8px 10px', background: '#f8f9fb', color: '#8a96a8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e6ed', whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', borderBottom: '1px solid #f1f3f6', color: '#1a2233', whiteSpace: 'nowrap' }
