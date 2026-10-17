const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_API_URL   = 'http://13.200.155.29:3000/ulip/v1.0.0/ICEGATE/09'
const ULIP_TIMEOUT_MS = 12000
const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
async function getUlipToken(): Promise<string> { const u=Deno.env.get('ULIP_USERNAME'),p=Deno.env.get('ULIP_PASSWORD'); if(!u||!p) throw new Error('ULIP credentials not configured'); const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS); const r=await fetch(ULIP_LOGIN_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({username:u,password:p}),signal:c.signal}); clearTimeout(t); if(!r.ok){let b='';try{b=await r.text()}catch{} throw new Error(`ULIP login failed HTTP ${r.status}: ${b}`)} const d=await r.json(); const tk=d?.response?.id||d?.response?.token||d?.data?.token||d?.token||null; if(!tk) throw new Error('No token'); return tk }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let mawbNumber='', custSite=''
  try { const b=await req.json(); mawbNumber=(b?.mawbNumber||'').trim(); custSite=(b?.custSite||'').trim() } catch { return new Response(JSON.stringify({ success:false, error:'Invalid body' }), { status:400, headers:corsHeaders }) }
  if (!/^[0-9]{1,20}$/.test(mawbNumber)) return new Response(JSON.stringify({ success:false, error:'mawbNumber must be 1-20 digits' }), { status:400, headers:corsHeaders })
  if (!/^[A-Za-z0-9]{6}$/.test(custSite)) return new Response(JSON.stringify({ success:false, error:'custSite must be 6 alphanumeric' }), { status:400, headers:corsHeaders })
  let token:string
  try { token=await getUlipToken() } catch(e:any) { return new Response(JSON.stringify({ success:false, error:`Auth failed: ${e.message}` }), { status:502, headers:corsHeaders }) }
  try {
    const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS)
    const res=await fetch(ULIP_API_URL,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({mawbNumber,custSite}),signal:c.signal})
    clearTimeout(t)
    const txt=await res.text(); let data:any
    try { data=JSON.parse(txt) } catch { return new Response(JSON.stringify({ success:false, found:false, error:'Non-JSON', httpStatus:res.status, rawResponse:txt.slice(0,2000) }), { status:200, headers:corsHeaders }) }
    if (!res.ok) return new Response(JSON.stringify({ success:false, error:`HTTP ${res.status}`, raw:data }), { status:res.status, headers:corsHeaders })
    const inner=data?.[0]?.response??data?.response??data
    const notFound=data?.[0]?.responseStatus==='ERROR'&&inner?.errCode==='ERROR0004'
    const found=!notFound&&inner&&Object.keys(inner).length>0
    return new Response(JSON.stringify({ success:true, found:!!found, data:found?inner:null, raw:data }), { status:200, headers:corsHeaders })
  } catch(err:any) { return new Response(JSON.stringify({ success:false, error:err.name==='AbortError'?'Timeout':`Unreachable: ${err.message}` }), { status:502, headers:corsHeaders }) }
})
