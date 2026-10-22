import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// Job documents live in the PRIVATE storage bucket "job-documents" (Jose, 22 Oct
// 2026: client papers must not open from a copied link). The portal opens them
// with a link that works for 1 hour, made for the signed-in staff member.
// Old rows only have file_url (the former public link): the path is read from it.
const BUCKET = 'job-documents'
const LINK_SECONDS = 60 * 60

export function docPath(doc) {
  if (doc?.file_path) return String(doc.file_path)
  const m = String(doc?.file_url || '').match(/\/object\/(?:public|sign)\/job-documents\/([^?]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// a 1-hour link to the file, or null
export async function docUrl(doc) {
  const path = docPath(doc)
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS)
  if (error) { console.warn('[docs] could not open', path, error.message); return null }
  return data?.signedUrl || null
}

// the file itself (for downloads and the PDF reader)
export async function docBlob(doc) {
  const path = docPath(doc)
  if (!path) throw new Error('This document has no file.')
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(error?.message || 'Could not load the file.')
  return data
}

// Opens the file in a new tab. The tab is opened straight away (so the browser
// doesn't block it), then pointed at the private link.
export async function openDoc(doc) {
  const tab = window.open('', '_blank')
  const url = await docUrl(doc)
  if (!url) { tab?.close(); alert('Could not open this document. Please try again.'); return }
  if (tab) tab.location.href = url
  else window.location.href = url
}

// Saves the file to the computer under its own name
export async function downloadDoc(doc) {
  const blob = await docBlob(doc)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = doc?.file_name || 'document'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

// For preview windows: the private link of the document shown (null while it loads)
export function useDocUrl(doc) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (doc) docUrl(doc).then((u) => { if (live) setUrl(u) })
    return () => { live = false }
  }, [doc])
  return url
}
