import { createContext, useContext } from 'react'

// What every part of the one-screen portal can reach (Portal.jsx provides it):
// { profile, user, perms, layout 'd'|'m', toast(message, tone), openJob(id),
//   closeJob(), openEdit(jobId), openManage(id, opts), openNewJob() }
export const PortalContext = createContext(null)

const NOOP = () => {}
const FALLBACK = {
  profile: null, user: null, perms: {}, layout: 'd',
  toast: NOOP, openJob: NOOP, closeJob: NOOP, openEdit: NOOP, openManage: NOOP, openNewJob: NOOP,
}

export const usePortal = () => useContext(PortalContext) || FALLBACK
