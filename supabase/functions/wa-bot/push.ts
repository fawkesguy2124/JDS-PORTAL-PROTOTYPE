// Desktop notifications for the portal app (Jose, 24 Oct 2026): the same alerts as
// WhatsApp (OOC granted, free days, ship in without BE, container moves), sent by the
// 15-minute alerts run to every computer that switched them on (push_subscriptions),
// for the kinds that computer chose. Free: browsers deliver them, not Meta.
import webpush from 'npm:web-push@3.6.7'

type Admin = any
const env = (k: string) => (Deno.env.get(k) || '').trim()
const TITLE: Record<string, string> = { ooc: 'OOC granted', free_days: 'Free days running out', be_not_filed: 'Ship in, BE not filed', container: 'Container update', ship_arrived: 'Ship arrived', ship_due: 'Ship arriving', ship_unloaded: 'Cargo unloaded', truck: 'Truck alert', system: 'JDS portal' }

let ready = false
function setup() {
  if (ready) return true
  if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) return false
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'https://jds-portal-prototype.vercel.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  ready = true
  return true
}

const short = async (s: string) => {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  return [...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// alerts: the instantAlerts list ({ key, kind, jobId, jobNo, template: { values: [who, what, jobNo] } })
export async function pushAlerts(admin: Admin, alerts: any[]) {
  if (!alerts.length || !setup()) return { sent: 0, skipped: alerts.length ? 'no VAPID keys' : 'nothing' }
  const { data: subs } = await admin.from('push_subscriptions').select('*')
  let sent = 0, gone = 0
  for (const s of subs || []) {
    const id = `push:${await short(s.endpoint)}`
    for (const a of alerts) {
      if (s.kinds && s.kinds[a.kind] === false) continue
      // each alert once per computer (the same table as WhatsApp's)
      const { error: dup } = await admin.from('bot_sent').insert({ key: a.key, phone: id, kind: `push-${a.kind}`, text: a.template?.values?.[1] || '' })
      if (dup) continue
      const [who, what] = a.template?.values || [a.jobNo, '']
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({
          title: `${TITLE[a.kind] || 'JDS alert'} · ${who}`, body: String(what || ''),
          url: a.jobId ? `/admin?tab=jobs&jobId=${a.jobId}` : '/admin?tab=today', tag: a.key,
        }), { TTL: 24 * 3600 })
        sent++
        await admin.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), failures: 0 }).eq('endpoint', s.endpoint)
      } catch (e: any) {
        // 404 / 410: that computer turned them off or the browser was reset — forget it
        if (e?.statusCode === 404 || e?.statusCode === 410) { await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); gone++; break }
        await admin.from('bot_sent').update({ error: `push ${e?.statusCode || ''} ${String(e?.body || e?.message || '').slice(0, 120)}` }).eq('key', a.key).eq('phone', id)
        await admin.from('push_subscriptions').update({ failures: (s.failures || 0) + 1 }).eq('endpoint', s.endpoint)
      }
    }
  }
  return { sent, gone, computers: (subs || []).length }
}

// One test notification to every computer of a user (or all), for checking the setup
export async function pushTest(admin: Admin, text: string) {
  if (!setup()) return { error: 'no VAPID keys' }
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth, user_name, device')
  const out = []
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: 'JDS Portal', body: text, url: '/admin?tab=today', tag: 'jds-test' }), { TTL: 600 })
      out.push({ who: s.user_name, device: s.device, ok: true })
    } catch (e: any) { out.push({ who: s.user_name, device: s.device, ok: false, status: e?.statusCode, error: String(e?.body || e?.message || '').slice(0, 160) }) }
  }
  return { computers: out }
}
