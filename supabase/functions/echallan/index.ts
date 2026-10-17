const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_API_URL   = 'http://13.200.155.29:3000/ulip/v1.0.0/ECHALLAN/01'
const ULIP_TIMEOUT_MS = 12000
const ULIP_PROXY_KEY = Deno.env.get('ULIP_PROXY_KEY') ?? ''
const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
async function getUlipToken(): Promise<string> { const u=Deno.env.get('ULIP_USERNAME'),p=Deno.env.get('ULIP_PASSWORD'); if(!u||!p) throw new Error('ULIP credentials not configured'); const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS); const r=await fetch(ULIP_LOGIN_URL,{method:'POST',headers:{'x-proxy-key': ULIP_PROXY_KEY, 'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({username:u,password:p}),signal:c.signal}); clearTimeout(t); if(!r.ok){let b='';try{b=await r.text()}catch{} throw new Error(`ULIP login failed HTTP ${r.status}: ${b}`)} const d=await r.json(); const tk=d?.response?.id||d?.response?.token||d?.data?.token||d?.token||null; if(!tk) throw new Error('No token'); return tk }

function mapDisposed(c:any) { return { challanNo:c?.challan_no, challanDateTime:c?.challan_date_time, challanStatus:c?.challan_status, challanPlace:c?.challan_place, ownerName:c?.owner_name, driverName:c?.driver_name, dlNo:c?.dl_no, fineImposed:c?.fine_imposed, amountOfFineImposed:c?.amount_of_fine_imposed, receivedAmount:c?.received_amount, receiptNo:c?.receipt_no, department:c?.department, stateCode:c?.state_code, courtName:c?.court_name, courtAddress:c?.court_address, dateOfProceeding:c?.date_of_proceeding, sentToRegCourt:c?.sent_to_reg_court, sentToVirtualCourt:c?.sent_to_virtual_court, sentToCourtOn:c?.sent_to_court_on, documentImpounded:c?.document_impounded, remark:c?.remark, offenceDetails:c?.offence_details ?? [] } }
function mapPending(c:any) { return { challanNo:c?.challan_no, challanDateTime:c?.challan_date_time, challanStatus:c?.challan_status, challanPlace:c?.challan_place, ownerName:c?.owner_name, driverName:c?.driver_name, dlNo:c?.dl_no, fineImposed:c?.fine_imposed, amountOfFineImposed:c?.amount_of_fine_imposed, rtoDistrictName:c?.rto_distric_name, department:c?.department, stateCode:c?.state_code, courtName:c?.court_name, courtAddress:c?.court_address, sentToRegCourt:c?.sent_to_reg_court, sentToVirtualCourt:c?.sent_to_virtual_court, documentImpounded:c?.document_impounded, remark:c?.remark, offenceDetails:c?.offence_details ?? [] } }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let vehicleNumber=''
  try { const b=await req.json(); vehicleNumber=(b?.vehicleNumber||'').trim().toUpperCase() } catch { return new Response(JSON.stringify({ success:false, error:'Invalid body' }), { status:400, headers:corsHeaders }) }
  if (!/^[a-zA-Z0-9]{5,11}$/.test(vehicleNumber)) return new Response(JSON.stringify({ success:false, error:'vehicleNumber must be 5-11 alphanumeric' }), { status:400, headers:corsHeaders })
  let token:string
  try { token=await getUlipToken() } catch(e:any) { return new Response(JSON.stringify({ success:false, error:`Auth failed: ${e.message}` }), { status:502, headers:corsHeaders }) }
  try {
    const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS)
    const res=await fetch(ULIP_API_URL,{method:'POST',headers:{'x-proxy-key': ULIP_PROXY_KEY, 'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({vehicleNumber}),signal:c.signal})
    clearTimeout(t)
    const txt=await res.text(); let raw:any
    try { raw=JSON.parse(txt) } catch { return new Response(JSON.stringify({ success:false, found:false, error:'Non-JSON', httpStatus:res.status, rawResponse:txt.slice(0,2000) }), { status:200, headers:corsHeaders }) }
    if (!res.ok) return new Response(JSON.stringify({ success:false, error:`HTTP ${res.status}`, raw }), { status:res.status, headers:corsHeaders })
    const r = raw?.response?.[0]?.response
    const notFound = r?.code === '305'
    const data = r?.data ?? null
    const disposed = (data?.Disposed_data ?? []).map(mapDisposed)
    const pending = (data?.Pending_data ?? []).map(mapPending)
    const normalized = { vehicleNumber, disposedChallans: disposed, pendingChallans: pending, totalDisposed: disposed.length, totalPending: pending.length, found: !notFound && data != null }
    return new Response(JSON.stringify({ success:true, found:normalized.found, data: normalized.found ? normalized : null, raw }), { status:200, headers:corsHeaders })
  } catch(err:any) { return new Response(JSON.stringify({ success:false, error:err.name==='AbortError'?'Timeout':`Unreachable: ${err.message}` }), { status:502, headers:corsHeaders }) }
})