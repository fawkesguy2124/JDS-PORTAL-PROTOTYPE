import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { loadJourneyData } from '../../services/journey'
import { PageHead, Skeleton } from '../../industrial/ui'
import { morningSummary, instantAlerts, answer, teamFromProfiles, TEMPLATES } from '../../../supabase/functions/_shared/portal/botMessages.js'

// What the JDS WhatsApp bot would send each team member, built from the same
// saved data and the same rules as the bot itself. Nothing is sent from here.
const DAY = 24 * 60 * 60 * 1000
// blocks on the shared hairline look (Control tower, Jose 31 Oct 2026)
const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '12px 16px', marginBottom: '12px' }
const muted = { color: 'var(--text-2)' }
// The chat panels keep WhatsApp's own look, in its light or dark colours to match the
// portal's theme (dark mode: Jose, 31 Oct 2026). The cards around them use the tokens.
const WA = {
  light: { wall: '#efeae2', bubble: '#ffffff', mine: '#d9fdd3', edge: '#e2e6ed', field: '#ffffff', text: '#111b21' },
  dark: { wall: '#0b141a', bubble: '#202c33', mine: '#005c4b', edge: '#2a3942', field: '#2a3942', text: '#e9edef' },
}
const isDark = () => document.documentElement.dataset.theme === 'dark'
// follows the theme the Settings page puts on <html> (light / dark, "system" already resolved)
function useWa() {
  const [dark, setDark] = useState(isDark)
  useEffect(() => {
    const watch = new MutationObserver(() => setDark(isDark()))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => watch.disconnect()
  }, [])
  return WA[dark ? 'dark' : 'light']
}

// WhatsApp-style text: *bold*, line breaks
function WaText({ text }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
      {String(text).split(/(\*[^*\n]+\*)/g).map((part, i) =>
        /^\*[^*\n]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : <span key={i}>{part}</span>)}
    </div>
  )
}

function Bubble({ text, mine, note, wa }) {
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
      <div style={{ maxWidth: '92%', background: mine ? wa.mine : wa.bubble, color: wa.text, border: `1px solid ${wa.edge}`, borderRadius: '10px', padding: '8px 10px', fontSize: '14px', boxShadow: '0 1px 1px rgba(0,0,0,.05)' }}>
        <WaText text={text} />
        {note && <div style={{ color: wa.text, opacity: 0.65, fontSize: '11px', marginTop: '4px', textAlign: 'right' }}>{note}</div>}
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
  const wa = useWa()
  // phones: a finger-sized tick box and a shorter hint in the ask box (Jose, 1 Nov 2026)
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches
  const chatCard = { ...card, background: wa.wall, color: wa.text }

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
    <>
      {/* the frame (padding, background) comes from AdminDashboard */}
      <PageHead title="WhatsApp bot"
        sub={['What the bot would send each team member today', 'built from saved portal data only, no government checks', <b key="n">Nothing is sent from this page</b>]} />

      {error && <div className="ix-error">Some data could not be loaded: {error}</div>}
      {!data && !error && <div className="ix-card"><Skeleton rows={5} /></div>}

      {data && (
        <>
          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Team members the bot talks to ({team.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {team.map((t) => (
                <button key={t.id} onClick={() => { setWho(t.id); setChat([]) }}
                  style={{ minHeight: '40px', padding: '6px 12px', borderRadius: '10px', cursor: 'pointer', font: 'inherit', color: 'var(--text)', border: `1.5px solid ${t.id === who ? 'var(--navy)' : 'var(--line-2)'}`, background: t.id === who ? 'var(--navy-50)' : 'var(--surface)' }}>
                  {t.name} <span style={{ ...muted, fontSize: '12px' }}>· +{t.phone.slice(0, 2)} {t.phone.slice(2)}</span>
                </button>
              ))}
            </div>
            <div style={{ ...muted, fontSize: '12px', marginTop: '8px' }}>
              Only these numbers get messages, and the bot ignores messages from anyone else.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '12px', alignItems: 'start' }}>
            <div style={chatCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600 }}>Morning summary · 8:00</div>
                <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', ...(phone ? { fontSize: '13px', minHeight: '36px', paddingLeft: '4px' } : null) }}>
                  <input type="checkbox" checked={asShort} onChange={(e) => setAsShort(e.target.checked)} style={phone ? { width: '18px', height: '18px', margin: 0 } : undefined} /> Short version
                </label>
              </div>
              {summary && (asShort
                ? <Bubble wa={wa} text={fillTemplate(summary.template.name, summary.template.values)} note="Sent when they haven't messaged the bot in 24 h (WhatsApp rule)" />
                : <Bubble wa={wa} text={summary.text} note="Full list" />)}
            </div>

            <div style={chatCard}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Instant alerts · last 24 hours ({alerts.length})</div>
              {alerts.length === 0 && <div style={{ opacity: 0.7 }}>No alerts in the last 24 hours.</div>}
              {alerts.map((a) => <Bubble wa={wa} key={a.key} text={asShort ? fillTemplate(a.template.name, a.template.values) : a.text} note={a.kind.replace(/_/g, ' ')} />)}
            </div>

            <div style={chatCard}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Ask the bot (try it)</div>
              {chat.length === 0 && <Bubble wa={wa} text={answer(data, 'help', person)} />}
              {chat.map((m, i) => <Bubble wa={wa} key={i} mine={m.mine} text={m.text} />)}
              <form onSubmit={ask} style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={phone ? 'Job, container, BE or SUMMARY' : 'J-193, a container no, a BE no, SUMMARY…'}
                  style={{ flex: 1, minWidth: 0, height: '44px', padding: '0 12px', border: `1.5px solid ${wa.edge}`, borderRadius: '22px', fontSize: '14px', background: wa.field, color: wa.text }} />
                <button type="submit" style={{ height: '44px', padding: '0 16px', borderRadius: '22px', border: 'none', background: '#1f8f4e', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Send</button>
              </form>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>Message templates to submit in Meta</div>
            <div style={{ ...muted, fontSize: '13px', marginBottom: '8px' }}>WhatsApp Manager → Message templates → Create. Category: Utility. Language: English. Use these names and wording exactly.</div>
            {Object.entries(TEMPLATES).map(([name, t]) => (
              <div key={name} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{name}</div>
                <div style={{ margin: '4px 0' }}>{t.body}</div>
                <div style={{ ...muted, fontSize: '12px' }}>Sample values: {t.sample.map((s, i) => `{{${i + 1}}} = ${s}`).join(' · ')}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
