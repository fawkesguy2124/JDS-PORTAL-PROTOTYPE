// Shared types for the ULIP API registry.
// Registry files must stay plain TypeScript (no Deno or browser APIs) because
// they are used by the Edge Function, by the portal (input rules and labels)
// and by tests run with Node.

export type InputDef = {
  key: string                       // body field name, exact case as ULIP expects
  label: string                     // plain label for staff, e.g. "BE number"
  pattern: RegExp                   // must match ULIP's documented format
  hint: string                      // shown when the value is wrong, e.g. "7 digits, like 2237841"
  kind?: 'text' | 'date8' | 'isoDate' // date8 = DDMMYYYY sent to ULIP, isoDate = YYYY-MM-DD sent; both show a date picker
  optional?: boolean
  upper?: boolean                   // upper-case before checking (vehicle numbers, container numbers)
}

export type Field = { label: string; value: string | null }

export type Table = { title: string; columns: string[]; rows: (string | null)[][] }

export type Parsed = {
  found: boolean                    // ULIP answered and had a record
  summary: string                   // one plain sentence for staff, e.g. "OOC granted on 26 Mar 2012"
  tone?: 'good' | 'warn' | 'bad' | 'info'
  fields: Field[]                   // the important values, in the order staff should read them
  tables?: Table[]                  // lists such as toll crossings, containers, vehicles
  extra?: Record<string, unknown>   // machine-friendly values for other features (e.g. truckNumbers)
}

export type ApiDef = {
  id: string                        // 'ICEGATE/03' — must be one of the 50 approved APIs
  name: string                      // plain name, e.g. "OOC from Customs"
  inputs: InputDef[]
  oneOf?: boolean                   // true = staff fill exactly ONE of the (optional) inputs
  buildBody?: (params: Record<string, string>) => unknown   // default: the inputs as given
  parse: (body: any) => Parsed      // body = ULIP's full JSON answer
}
