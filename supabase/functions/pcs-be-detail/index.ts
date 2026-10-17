const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_API_URL   = 'http://13.200.155.29:3000/ulip/v1.0.0/PCS/04'
const ULIP_TIMEOUT_MS = 12000
const ULIP_PROXY_KEY = Deno.env.get('ULIP_PROXY_KEY') ?? ''
const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
async function getUlipToken(): Promise<string> { const u=Deno.env.get('ULIP_USERNAME'),p=Deno.env.get('ULIP_PASSWORD'); if(!u||!p) throw new Error('ULIP credentials not configured'); const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS); const r=await fetch(ULIP_LOGIN_URL,{method:'POST',headers:{'x-proxy-key': ULIP_PROXY_KEY, 'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({username:u,password:p}),signal:c.signal}); clearTimeout(t); if(!r.ok){let b='';try{b=await r.text()}catch{} throw new Error(`ULIP login failed HTTP ${r.status}: ${b}`)} const d=await r.json(); const tk=d?.response?.id||d?.response?.token||d?.data?.token||d?.token||null; if(!tk) throw new Error('No token'); return tk }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let boeNumber=''
  try { const b=await req.json(); boeNumber=(b?.boeNumber||'').trim() } catch { return new Response(JSON.stringify({ success:false, error:'Invalid body' }), { status:400, headers:corsHeaders }) }
  if (!boeNumber) return new Response(JSON.stringify({ success:false, error:'boeNumber required' }), { status:400, headers:corsHeaders })
  let token:string
  try { token=await getUlipToken() } catch(e:any) { return new Response(JSON.stringify({ success:false, error:`Auth failed: ${e.message}` }), { status:502, headers:corsHeaders }) }
  try {
    const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS)
    const res=await fetch(ULIP_API_URL,{method:'POST',headers:{'x-proxy-key': ULIP_PROXY_KEY, 'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({boeNumber,interfaceName:'CHPOI09'}),signal:c.signal})
    clearTimeout(t)
    const txt=await res.text(); let raw:any
    try { raw=JSON.parse(txt) } catch { return new Response(JSON.stringify({ success:false, found:false, error:'Non-JSON', httpStatus:res.status, rawResponse:txt.slice(0,2000) }), { status:200, headers:corsHeaders }) }
    if (!res.ok) return new Response(JSON.stringify({ success:false, error:`HTTP ${res.status}`, raw }), { status:res.status, headers:corsHeaders })
    const r = raw?.response?.[0]?.response
    const normalized = { igmNo: r?.igmNo, igmDate: r?.igmDate, billOfEntryNo: r?.billOfEntryNo, billOfEntryDate: r?.billOfEntryDate, chaCode: r?.chaCode, lineNo: r?.lineNo, sublineNo: r?.sublineNo, natureOfCargo: r?.natureOfCargo, grossWeight: r?.grossWeight, numberOfPackages: r?.numberOfPackages, countryOfOrigin: r?.countryOfOrigin, containerNo: r?.container_no, found: r?.igmNo != null }
    return new Response(JSON.stringify({ success:true, found:normalized.found, data: normalized.found ? normalized : null, raw }), { status:200, headers:corsHeaders })
  } catch(err:any) { return new Response(JSON.stringify({ success:false, error:err.name==='AbortError'?'Timeout':`Unreachable: ${err.message}` }), { status:502, headers:corsHeaders }) }
})