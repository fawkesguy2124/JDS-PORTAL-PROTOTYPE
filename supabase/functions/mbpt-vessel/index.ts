const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_API_URL   = 'http://13.200.155.29:3000/ulip/v1.0.0/MBPT/01'
const ULIP_TIMEOUT_MS = 12000
const ULIP_PROXY_KEY = Deno.env.get('ULIP_PROXY_KEY') ?? ''
const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
async function getUlipToken(): Promise<string> { const u=Deno.env.get('ULIP_USERNAME'),p=Deno.env.get('ULIP_PASSWORD'); if(!u||!p) throw new Error('ULIP credentials not configured'); const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS); const r=await fetch(ULIP_LOGIN_URL,{method:'POST',headers:{'x-proxy-key': ULIP_PROXY_KEY, 'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({username:u,password:p}),signal:c.signal}); clearTimeout(t); if(!r.ok){let b='';try{b=await r.text()}catch{} throw new Error(`ULIP login failed HTTP ${r.status}: ${b}`)} const d=await r.json(); const tk=d?.response?.id||d?.response?.token||d?.data?.token||d?.token||null; if(!tk) throw new Error('No token'); return tk }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let vcnNo=''
  try { const b=await req.json(); vcnNo=(b?.vcnNo||'').trim() } catch { return new Response(JSON.stringify({ success:false, error:'Invalid body' }), { status:400, headers:corsHeaders }) }
  if (!/^[a-zA-Z0-9]{2,14}$/.test(vcnNo)) return new Response(JSON.stringify({ success:false, error:'vcnNo must be 2-14 alphanumeric' }), { status:400, headers:corsHeaders })
  let token:string
  try { token=await getUlipToken() } catch(e:any) { return new Response(JSON.stringify({ success:false, error:`Auth failed: ${e.message}` }), { status:502, headers:corsHeaders }) }
  try {
    const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS)
    const res=await fetch(ULIP_API_URL,{method:'POST',headers:{'x-proxy-key': ULIP_PROXY_KEY, 'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({vcnNo}),signal:c.signal})
    clearTimeout(t)
    const txt=await res.text(); let raw:any
    try { raw=JSON.parse(txt) } catch { return new Response(JSON.stringify({ success:false, found:false, error:'Non-JSON', httpStatus:res.status, rawResponse:txt.slice(0,2000) }), { status:200, headers:corsHeaders }) }
    if (!res.ok) return new Response(JSON.stringify({ success:false, error:`HTTP ${res.status}`, raw }), { status:res.status, headers:corsHeaders })
    const notFound = raw?.response?.[0]?.response?.status === '1'
    const r = raw?.response?.[0]?.response?.VoyageDetails
    const normalized = { imoNumber: r?.IMO_NUMBER, vesselName: r?.VESSEL_NAME, vcnNo: r?.VIA_NO, eta: r?.ETA, etd: r?.ETD, ata: r?.ATA, atd: r?.ATD, applicationType: r?.APPLICATION_TYPE, portOfArrivalName: r?.PORT_OF_ARRIVAL_NAME, vesselType: r?.VESSEL_TYPE, shippingLineCode: r?.SHIPPING_LINE_CODE, shippingAgentCode: r?.SHIPPING_AGENT_CODE, lastPortOfCallName: r?.LAST_PORT_OF_CALL_NAME, found: !notFound && r?.IMO_NUMBER != null }
    return new Response(JSON.stringify({ success:true, found:normalized.found, data: normalized.found ? normalized : null, raw }), { status:200, headers:corsHeaders })
  } catch(err:any) { return new Response(JSON.stringify({ success:false, error:err.name==='AbortError'?'Timeout':`Unreachable: ${err.message}` }), { status:502, headers:corsHeaders }) }
})