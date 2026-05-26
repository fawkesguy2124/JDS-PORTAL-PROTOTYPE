import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { STAGE_NAMES } from '../utils/jobHelpers'

const MODES = ['Sea FCL', 'Sea LCL', 'Air', 'BPT/MBPT']
const PRIORITIES = ['normal', 'high', 'urgent']
const RMS_STATUSES = ['pending', 'rms', 'apr', 'acl', 'check', 'hold']
const BG_OPTIONS = ['no', 'yes', '100percent']
const DETENTION_RISKS = ['low', 'medium', 'high']

const INITIAL_FORM = {
  job_no: '',
  client: '',
  mode: 'Sea FCL',
  goods: '',
  priority: 'normal',
  assigned_to: '',
  bl_no: '',
  containers: '',
  vessel: '',
  eta: '',
  cfs_name: '',
  cfs_amount: '',
  be_no: '',
  hs_code: '',
  rms_status: 'pending',
  bg_required: 'no',
  destination: '',
  free_days: '14',
  detention_risk: 'low',
  stage: '0',
  delay_reason: '',
  notes: '',
}

const inputClass =
  'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent'
const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

function SectionHeading({ children }) {
  return (
    <div className="col-span-full border-b border-gray-200 pb-2 mb-2 mt-4 first:mt-0">
      <h2 className="text-lg font-semibold text-gray-800">{children}</h2>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className={labelClass}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function CreateJob({ isModal = false, onCancel, onCreated }) {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [form, setForm] = useState(INITIAL_FORM)
  const [profiles, setProfiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadProfiles() {
      const { data } = await supabase.from('profiles').select('id, name').order('name')
      setProfiles(data ?? [])
    }
    loadProfiles()
  }, [])

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setError('')
  }

  const setJobNumber = (e) => {
    setForm((prev) => ({ ...prev, job_no: e.target.value.replace(/\D/g, '') }))
    setError('')
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
      return
    }
    navigate('/admin')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    if (!user?.id) {
      setError('You must be logged in to create a job.')
      setSaving(false)
      return
    }

    const payload = {
      job_no: `J-${form.job_no.trim()}`,
      client: form.client.trim(),
      mode: form.mode,
      goods: form.goods.trim() || null,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      bl_no: form.bl_no.trim() || null,
      containers: form.containers.trim() || null,
      vessel: form.vessel.trim() || null,
      eta: form.eta || null,
      cfs_name: form.cfs_name.trim() || null,
      cfs_amount: form.cfs_amount !== '' ? Number(form.cfs_amount) : null,
      be_no: form.be_no.trim() || null,
      hs_code: form.hs_code.trim() || null,
      rms_status: form.rms_status,
      bg_required: form.bg_required,
      destination: form.destination.trim() || null,
      free_days: form.free_days !== '' ? Number(form.free_days) : 14,
      detention_risk: form.detention_risk,
      stage: Number(form.stage),
      delay_reason: form.delay_reason.trim() || null,
      notes: form.notes.trim() || null,
      created_by: user.id,
    }

    const { error: insertError } = await supabase.from('jobs').insert(payload)

    setSaving(false)

    if (insertError) {
      setError(insertError.message || 'Failed to create job. Please try again.')
      return
    }

    if (onCreated) {
      onCreated()
      return
    }
    navigate('/admin')
  }

  return (
    <div className={isModal ? 'bg-white flex flex-col max-h-[88vh]' : 'min-h-screen bg-gray-100 flex flex-col'}>
      <header className={isModal ? 'bg-white text-slate-900 px-5 py-4 border-b border-slate-200 flex items-center justify-between' : 'bg-[#1e3a5f] text-white px-6 py-4 shadow-md flex items-center justify-between'}>
        <div>
          <h1 className="text-xl font-semibold">Create Job</h1>
          <p className={isModal ? 'text-sm text-slate-500 mt-0.5' : 'text-sm text-blue-200 mt-0.5'}>JDS Logistics - Admin</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={isModal ? 'text-sm text-slate-500' : 'text-sm text-blue-100'}>{profile?.name}</span>
          {isModal && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-70"
              aria-label="Close create job"
            >
              x
            </button>
          )}
        </div>
      </header>

      <main className={isModal ? 'flex-1 p-5 overflow-y-auto' : 'flex-1 p-6 overflow-auto'}>
        <div className={isModal ? 'bg-white' : 'max-w-5xl mx-auto bg-white rounded-lg shadow-lg p-6 md:p-8'}>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <SectionHeading>Job Header</SectionHeading>

              <Field label="Job Number" required>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={form.job_no}
                  onChange={setJobNumber}
                  className={inputClass}
                  placeholder="e.g. 123"
                />
              </Field>

              <Field label="Client Name" required>
                <input
                  type="text"
                  required
                  value={form.client}
                  onChange={set('client')}
                  className={inputClass}
                />
              </Field>

              <Field label="Mode" required>
                <select value={form.mode} onChange={set('mode')} className={inputClass}>
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Goods Description">
                <input
                  type="text"
                  value={form.goods}
                  onChange={set('goods')}
                  className={inputClass}
                />
              </Field>

              <Field label="Priority" required>
                <select value={form.priority} onChange={set('priority')} className={inputClass}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Assign To">
                <select value={form.assigned_to} onChange={set('assigned_to')} className={inputClass}>
                  <option value="">Unassigned</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>

              <SectionHeading>Shipment Details</SectionHeading>

              <Field label="BL Number">
                <input type="text" value={form.bl_no} onChange={set('bl_no')} className={inputClass} />
              </Field>

              <Field label="Container Numbers">
                <input
                  type="text"
                  value={form.containers}
                  onChange={set('containers')}
                  className={inputClass}
                  placeholder="Comma-separated"
                />
              </Field>

              <Field label="Vessel / Flight">
                <input type="text" value={form.vessel} onChange={set('vessel')} className={inputClass} />
              </Field>

              <Field label="ETA">
                <input type="date" value={form.eta} onChange={set('eta')} className={inputClass} />
              </Field>

              <Field label="CFS Name">
                <input type="text" value={form.cfs_name} onChange={set('cfs_name')} className={inputClass} />
              </Field>

              <Field label="CFS Amount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cfs_amount}
                  onChange={set('cfs_amount')}
                  className={inputClass}
                />
              </Field>

              <SectionHeading>Customs</SectionHeading>

              <Field label="BE Number">
                <input type="text" value={form.be_no} onChange={set('be_no')} className={inputClass} />
              </Field>

              <Field label="HS Code">
                <input type="text" value={form.hs_code} onChange={set('hs_code')} className={inputClass} />
              </Field>

              <Field label="RMS Status">
                <select value={form.rms_status} onChange={set('rms_status')} className={inputClass}>
                  {RMS_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="BG Required">
                <select value={form.bg_required} onChange={set('bg_required')} className={inputClass}>
                  {BG_OPTIONS.map((b) => (
                    <option key={b} value={b}>
                      {b === '100percent' ? '100%' : b.charAt(0).toUpperCase() + b.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <SectionHeading>Delivery</SectionHeading>

              <Field label="Destination">
                <input
                  type="text"
                  value={form.destination}
                  onChange={set('destination')}
                  className={inputClass}
                />
              </Field>

              <Field label="Free Days">
                <input
                  type="number"
                  min="0"
                  value={form.free_days}
                  onChange={set('free_days')}
                  className={inputClass}
                />
              </Field>

              <Field label="Detention Risk">
                <select
                  value={form.detention_risk}
                  onChange={set('detention_risk')}
                  className={inputClass}
                >
                  {DETENTION_RISKS.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Current Stage">
                <select value={form.stage} onChange={set('stage')} className={inputClass}>
                  {Object.entries(STAGE_NAMES).map(([value, name]) => (
                    <option key={value} value={value}>
                      {value} — {name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="md:col-span-2">
                <Field label="Delay Reason">
                  <input
                    type="text"
                    value={form.delay_reason}
                    onChange={set('delay_reason')}
                    className={inputClass}
                  />
                </Field>
              </div>

              <SectionHeading>Notes</SectionHeading>

              <div className="md:col-span-2">
                <Field label="Notes">
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={set('notes')}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>

            {error && (
              <p className="mt-6 text-red-600 text-sm text-center">{error}</p>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-6">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#1e3a5f] rounded-md hover:bg-[#16304f] disabled:opacity-70 flex items-center gap-2"
              >
                {saving && (
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {saving ? 'Saving...' : 'Save Job'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
