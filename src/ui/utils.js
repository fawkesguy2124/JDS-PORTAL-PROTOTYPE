// Small helpers shared by the primitives.
export const cx = (...parts) => parts.filter(Boolean).join(' ')

export const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
