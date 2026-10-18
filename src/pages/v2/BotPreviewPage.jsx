import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { loadJourneyData } from '../../services/journey'
import { morningSummary, instantAlerts, answer, teamFromProfiles, TEMPLATES } from '../../../supabase/functions/_shared/portal/botMessages.js'

// What the JDS WhatsApp bot would send each team member, built from the same
// saved data and the same rules as the bot itself. Nothing is sent from here.
const DAY = 24 * 60 * 60 * 1000
const card = { background: 'white', border: '1.5px solid #e2e6ed', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }
const muted = { color: '#5b6678' }

// WhatsApp-style text: *bold*, line breaks
function WaText({ text }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
      {String(text).split(/(\*[^*\n]+\*)/g).map((part, i) =>
        /^\*[^*\n]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : <span key={i}>{part}</span>)}
    </div>
  )
}

function Bubble({ text, mine, note }) {
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
      <div style={{ maxWidth: '92%', background: mine ? '#d9fdd3' : 'white', border: '1px solid #e2e6ed', borderRadius: '10px', padding: '8px 10px', fontSize: '14px', boxShadow: '0 1px 1px rgba(0,0,0,.05)' }}>
        <WaText text={text} />
        {note && <div style={{ ...muted, fontSize: '11px', marginTop: '4px', textAlign: 'right' }}>{note}</div>}
      </div>
    </div>
  )
}

const fillTemplate = (name, values) => TEMPLATES[name].body.replace(/\{\{(\d+)\}\}/g, (_, n) => values[Number(n) - 1] ?? '')

export default function BotPreviewPage() {
  const [data, setData] = useState(null)
  const [team, setTeam] = useState([])
  const [events, setEvents] = useState([])
  const [error, setError] = useState(null)
  const [who, setWho] = useState(null)
  const [asShort, setAsShort] = useState(false)
  const [question, setQuestion] = useState('')
  const [chat, setChat] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const since = new Date(Date.now() - DAY).toISOString()
      const [d, p, ev] = await Promise.all([
        loadJourneyData(),
        supabase.from('profiles').select('id, name, email, role'),
        supabase.from('activity_log').select('*').gte('created_at', since).order('created_at'),
      ])
      if (cancelled) return
      const people = teamFromProfiles(p.data || [])
      setData(d)
      setTeam(people)
      setEvents(ev.data || [])
      setWho(people[0]?.id || null)
      setError(d.error || p.error?.message || ev.error?.message || null)
    })()
    return () => { cancelled = true }
  }, [])

  const person = team.find((t) => t.id === who) || null
  const summary = useMemo(() => (data && person ? morningSummary(data, person) : null), [data, person])
  const alerts = useMemo(() => (data ? instantAlerts(data, events) : []), [data, events])

  const ask = (e) => {
    e.preventDefault()
    const q = question.trim()
    if (!q || !data) return
    setChat((c) => [...c, { mine: true, text: q }, { mine: false, text: answer(data, q, person) }])
    setQuestion('')
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#1a2233', fontSize: '14px', background: '#f4f6f9', padding: '16px', minHeight: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>WhatsApp bot — preview</h1>
      <p style={{ ...muted, margin: '4px 0 12px' }}>
        What the bot would send each team member today. Built from saved portal data only (no AI, no ULIP calls). <b>Nothing is sent from this page.</b>
      </p>

      {error && <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', fontWeight: 600 }}>Some data could not be loaded: {error}</div>}
      {!data && !error && <div style={muted}>Loading…</div>}

      {data && (
        <>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Team members the bot talks to ({team.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {team.map((t) => (
                <button key={t.id} onClick={() => { setWho(t.id); setChat([]) }}
                  style={{ minHeight: '40px', padding: '6px 12px', borderRadius: '10px', cursor: 'pointer', font: 'inherit', border: `1.5px solid ${t.id === who ? '#1f6feb' : '#e2e6ed'}`, background: t.id === who ? '#eef4ff' : 'white' }}>
                  {t.name} <span style={{ ...muted, fontSize: '12px' }}>· +{t.phone.slice(0, 2)} {t.phone.slice(2)}</span>
                </button>
              ))}
            </div>
            <div style={{ ...muted, fontSize: '12px', marginTop: '8px' }}>
              From the staff logins (mobile number logins). Staff without a mobile login are not included. The free test number can send to 5 people at most.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px', alignItems: 'start' }}>
            <div style={{ ...card, background: '#efeae2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600 }}>Morning summary · 9:00</div>
                <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={asShort} onChange={(e) => setAsShort(e.target.checked)} /> Short version
                </label>
              </div>
              {summary && (asShort
                ? <Bubble text={fillTemplate(summary.template.name, summary.template.values)} note="Sent when they haven't messaged the bot in 24 h (WhatsApp rule)" />
                : <Bubble text={summary.text} note="Full list" />)}
            </div>

            <div style={{ ...card, background: '#efeae2' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Instant alerts · last 24 hours ({alerts.length})</div>
              {alerts.length === 0 && <div style={muted}>No alerts in the last 24 hours.</div>}
              {alerts.map((a) => <Bubble key={a.key} text={asShort ? fillTemplate(a.template.name, a.template.values) : a.text} note={a.kind.replace(/_/g, ' ')} />)}
            </div>

            <div style={{ ...card, background: '#efeae2' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Ask the bot (try it)</div>
              {chat.length === 0 && <Bubble text={answer(data, 'help', person)} />}
              {chat.map((m, i) => <Bubble key={i} mine={m.mine} text={m.text} />)}
              <form onSubmit={ask} style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="J-193, a container no, a BE no, SUMMARY…"
                  style={{ flex: 1, minWidth: 0, height: '44px', padding: '0 12px', border: '1.5px solid #e2e6ed', borderRadius: '22px', fontSize: '14px', background: 'white' }} />
                <button type="submit" style={{ height: '44px', padding: '0 16px', borderRadius: '22px', border: 'none', background: '#1f8f4e', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Send</button>
              </form>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>Message templates to submit in Meta</div>
            <div style={{ ...muted, fontSize: '13px', marginBottom: '8px' }}>WhatsApp Manager → Message templates → Create. Category: Utility. Language: English. Use these names and wording exactly.</div>
            {Object.entries(TEMPLATES).map(([name, t]) => (
              <div key={name} style={{ borderTop: '1px solid #eef0f4', padding: '8px 0' }}>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{name}</div>
                <div style={{ margin: '4px 0' }}>{t.body}</div>
                <div style={{ ...muted, fontSize: '12px' }}>Sample values: {t.sample.map((s, i) => `{{${i + 1}}} = ${s}`).join(' · ')}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
