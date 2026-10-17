const ULIP_LOGIN_URL = 'http://13.200.155.29:3000/ulip/v1.0.0/user/login'
const ULIP_API_URL   = 'http://13.200.155.29:3000/ulip/v1.0.0/MBPT/03'
const ULIP_TIMEOUT_MS = 12000
const ULIP_PROXY_KEY = Deno.env.get('ULIP_PROXY_KEY') ?? ''
const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
async function getUlipToken(): Promise<string> { const u=Deno.env.get('ULIP_USERNAME'),p=Deno.env.get('ULIP_PASSWORD'); if(!u||!p) throw new Error('ULIP credentials not configured'); const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS); const r=await fetch(ULIP_LOGIN_URL,{method:'POST',headers:{'x-proxy-key': ULIP_PROXY_KEY, 'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({username:u,password:p}),signal:c.signal}); clearTimeout(t); if(!r.ok){let b='';try{b=await r.text()}catch{} throw new Error(`ULIP login failed HTTP ${r.status}: ${b}`)} const d=await r.json(); const tk=d?.response?.id||d?.response?.token||d?.data?.token||d?.token||null; if(!tk) throw new Error('No token'); return tk }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let shippingBillNo='', shippingBillDate=''
  try { const b=await req.json(); shippingBillNo=(b?.shippingBillNo||'').trim(); shippingBillDate=(b?.shippingBillDate||'').trim() } catch { return new Response(JSON.stringify({ success:false, error:'Invalid body' }), { status:400, headers:corsHeaders }) }
  if (!/^[0-9]{1,7}$/.test(shippingBillNo)) return new Response(JSON.stringify({ success:false, error:'shippingBillNo must be 1-7 digits' }), { status:400, headers:corsHeaders })
  if (!/^[0-9]{8}$/.test(shippingBillDate)) return new Response(JSON.stringify({ success:false, error:'shippingBillDate must be 8 digits' }), { status:400, headers:corsHeaders })
  let token:string
  try { token=await getUlipToken() } catch(e:any) { return new Response(JSON.stringify({ success:false, error:`Auth failed: ${e.message}` }), { status:502, headers:corsHeaders }) }
  try {
    const c=new AbortController(),t=setTimeout(()=>c.abort(),ULIP_TIMEOUT_MS)
    const res=await fetch(ULIP_API_URL,{method:'POST',headers:{'x-proxy-key': ULIP_PROXY_KEY, 'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({shippingBillNo,shippingBillDate}),signal:c.signal})
    clearTimeout(t)
    const txt=await res.text(); let raw:any
    try { raw=JSON.parse(txt) } catch { return new Response(JSON.stringify({ success:false, found:false, error:'Non-JSON', httpStatus:res.status, rawResponse:txt.slice(0,2000) }), { status:200, headers:corsHeaders }) }
    if (!res.ok) return new Response(JSON.stringify({ success:false, error:`HTTP ${res.status}`, raw }), { status:res.status, headers:corsHeaders })
    const notFound = raw?.response?.[0]?.response?.status === '1'
    const r = raw?.response?.[0]?.response?.ExpGPDtls
    const normalized = { shippingBillNo: r?.shipping_bill_no, shippingBillDate: r?.shipping_bill_date, egmNo: r?.egm_no, egmDate: r?.egm_date, exporterName: r?.exporter_name, leoDate: r?.leo_date, rotationNo: r?.rotation_no, rotationDate: r?.rotation_date, vcnNo: r?.vcn_no, portOfLoading: r?.port_of_loading, portOfOrigin: r?.port_of_origin, portOfDestinationCode: r?.port_of_destination_code, natureOfCargo: r?.nature_of_cargo, cargoType: r?.cargo_type, chaCode: r?.cha_code, vehicleInfo: r?.vehicle_info ?? [], found: !notFound && r?.shipping_bill_no != null }
    return new Response(JSON.stringify({ success:true, found:normalized.found, data: normalized.found ? normalized : null, raw }), { status:200, headers:corsHeaders })
  } catch(err:any) { return new Response(JSON.stringify({ success:false, error:err.name==='AbortError'?'Timeout':`Unreachable: ${err.message}` }), { status:502, headers:corsHeaders }) }
})