// Reads today's JNPA berthing reports the way the port-berthing function does (unpdf in Deno)
// and prints where the given ships stand. Nothing is saved.
//   npx deno@2 run --allow-net --allow-read scripts/berthing-live.ts "WAN HAI 512" "SPARROW"
import { CONTAINER_TERMINALS, readBerthingPage, shipAtJnpa } from '../supabase/functions/_shared/portal/jnpaBerthing.js'
import { pdfToLines } from '../supabase/functions/_shared/portal/beParser.js'
const PAGE = 'https://www.jnport.gov.in/page/daily-berthing-report/M2VlS0pwUXZ3akhSV0E0RDFUVlhxQT09'
const UA = { 'User-Agent': 'Mozilla/5.0 (JDS Logistics portal; daily berthing report)' }
const page = readBerthingPage(await (await fetch(PAGE, { headers: UA })).text())
const { getDocumentProxy }: any = await import('https://esm.sh/unpdf@0.12.1')
const pages: any[] = []
for (const t of CONTAINER_TERMINALS) {
  if (!page.reports[t]) { console.log(t, 'no link'); continue }
  const r = await fetch(page.reports[t], { headers: UA })
  pages.push({ terminal: t, lines: await pdfToLines(await getDocumentProxy(new Uint8Array(await r.arrayBuffer()))) })
  console.log(t, pages.at(-1).lines.length, 'lines')
}
console.log('at berth now:', page.atBerth.filter((b) => b.cargo === 'CONTAINER').map((b) => `${b.terminal} ${b.vessel}`).join(', '))
for (const name of Deno.args) { const r = shipAtJnpa(name, pages, page.atBerth); console.log(name.padEnd(20), r ? `${r.terminal} ${r.status} ${r.at} via ${r.via}` : 'not listed') }
