const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_API_URL   = 'http://13.200.155.29:3000/ulip/v1.0.0/MBPT/02'
const ULIP_TIMEOUT_MS = 12000
const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
async function getUlipToken(): Promise<string> { const u=Deno.env.get('ULIP_USERNAME'),p=Deno.env.get('ULIP_PASSWORD'); if(!u||!p) throw new Error('ULIP credentials not configured'); const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS); const r=await fetch(ULIP_LOGIN_URL,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({username:u,password:p}),signal:c.signal}); clearTimeout(t); if(!r.ok){let b='';try{b=await r.text()}catch{} throw new Error(`ULIP login failed HTTP ${r.status}: ${b}`)} const d=await r.json(); const tk=d?.response?.id||d?.response?.token||d?.data?.token||d?.token||null; if(!tk) throw new Error('No token'); return tk }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let igmNo='', igmDate='', itemNo=''
  try { const b=await req.json(); igmNo=(b?.igmNo||'').trim(); igmDate=(b?.igmDate||'').trim(); itemNo=(b?.itemNo||'').trim() } catch { return new Response(JSON.stringify({ success:false, error:'Invalid body' }), { status:400, headers:corsHeaders }) }
  if (!igmNo) return new Response(JSON.stringify({ success:false, error:'igmNo required' }), { status:400, headers:corsHeaders })
  if (!igmDate) return new Response(JSON.stringify({ success:false, error:'igmDate required' }), { status:400, headers:corsHeaders })
  if (!itemNo) return new Response(JSON.stringify({ success:false, error:'itemNo required' }), { status:400, headers:corsHeaders })
  let token:string
  try { token=await getUlipToken() } catch(e:any) { return new Response(JSON.stringify({ success:false, error:`Auth failed: ${e.message}` }), { status:502, headers:corsHeaders }) }
  try {
    const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS)
    const res=await fetch(ULIP_API_URL,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({igmNo,igmDate,itemNo}),signal:c.signal})
    clearTimeout(t)
    const txt=await res.text(); let raw:any
    try { raw=JSON.parse(txt) } catch { return new Response(JSON.stringify({ success:false, found:false, error:'Non-JSON', httpStatus:res.status, rawResponse:txt.slice(0,2000) }), { status:200, headers:corsHeaders }) }
    if (!res.ok) return new Response(JSON.stringify({ success:false, error:`HTTP ${res.status}`, raw }), { status:res.status, headers:corsHeaders })
    const notFound = raw?.response?.[0]?.response?.status === '1'
    const r = raw?.response?.[0]?.response?.IgmGPDtls
    const normalized = { beNo: r?.be_no, beDate: r?.be_date, igmNo: r?.igm_no, igmDate: r?.igm_date, blNo: r?.bl_no, chaCode: r?.cha_code, importerName: r?.importer_name, importerAddress: r?.importer_address, goodsDescription: r?.goods_description, natureOfCargo: r?.nature_of_cargo, cargoType: r?.crg_type, countryOfOrigin: r?.country_of_origin, noOfPackages: r?.no_of_packages_qty, oocDate: r?.out_of_charge_date, doDate: r?.do_date, doNo: r?.delivery_order_no, vehicleInfo: r?.vehicle_info ?? [], found: !notFound && r?.be_no != null }
    return new Response(JSON.stringify({ success:true, found:normalized.found, data: normalized.found ? normalized : null, raw }), { status:200, headers:corsHeaders })
  } catch(err:any) { return new Response(JSON.stringify({ success:false, error:err.name==='AbortError'?'Timeout':`Unreachable: ${err.message}` }), { status:502, headers:corsHeaders }) }
})