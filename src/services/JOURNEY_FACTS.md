# Journey facts: one number, one source

Jose, 31 Oct 2026: every screen must show the same numbers. The audit found Today, the
sidebar badges, Detention, Clients, Trucks and Containers each counting the same thing
their own way. This file lists the shared helpers. **Pages must read these and must not
recount on their own.**

The rules live in `supabase/functions/_shared/portal/journeyCore.js` (the WhatsApp bot uses
the same file). `src/services/journey.js` re-exports all of it, so pages import from
`../services/journey` (or `../../services/journey`).

## The easiest way: `useJourney()`

`src/industrial/JourneyContext.jsx` works everything out once per data load:

| Field | What it is | Built with |
|---|---|---|
| `rows` | every job: `[{ job, j }]` (`j` = `journeyFor(job, data)`) | `journeyFor` |
| `byId` | `{ [job.id]: { job, j } }` | |
| `active` | the open jobs (the "12 active") | `activeRows(rows)` |
| `facts.detention` | open jobs at detention risk (2 free days or fewer, or detention running) | `isDetentionRisk(j)` |
| `facts.needTruck` | open jobs with OOC done and no truck / rail arranged | `needATruck(active)` |
| `facts.onRoad` | the one "on the road" list (see Trucks below) | `onTheRoad(active)` |
| `facts.containers` | one entry per container of the open import jobs | `containersInPlay(active, data)` |
| `facts.byClient` | open and total jobs per client | `activeJobsByClient(rows)` |
| `data` | the loaded rows (`jobs`, `customsByJob`, `resultsByJob`, `containersByNo`, `seaByJob`, `shipIds`, `loadedAt`, `error`) | `loadJourneyData()` |

A page that lays fresh check answers over the rows (TrucksPage's `useOverlay`) passes its own
rows to the same helpers (`onTheRoad(rows)`, `needATruck(rows)`), never its own filter.

## Which screen reads what

| Screen / number | Read |
|---|---|
| Sidebar "All jobs" badge, Today "Active jobs" KPI, All jobs "All open" tab | `active.length` |
| Sidebar "Detention" badge, Today "Free days ≤ 2" KPI, All jobs "Detention risk" tab, Detention page "at risk" tile | `facts.detention.length` (jobs). Detention page rows: `facts.containers` |
| Free days in the jobs table, the job panel, Today rows | `j.freeDaysLeft` and `j.freeTill` (and `j.freeBox` for the container) |
| Detention page rows and tiles | `facts.containers` (`freeLeft`, `freeTill`, `detentionDays`, `level`, `stale`, `finishedOn`) |
| Sidebar "Trucks" badge, Today "Move not arranged" KPI, Trucks "Ready for a truck" list, All jobs "Needs truck / rail" tab | `facts.needTruck` (badge tooltip: "n need a truck") |
| Trucks status line, Trucks map message and pins, Trucks "On the road" count, Today "Trucks on the road" KPI | `facts.onRoad` (count jobs with `jobCount(facts.onRoad)`) |
| Trucks auto-checks (FASTag / papers) and the map's truck list | `jobTruckEntries(rows)` (every truck whose trip is not over, seen or not) |
| Clients page "Open" and "Total" | `facts.byClient[clientKey(name)]` (`open`, `total`, `openJobIds`) |
| Containers page (rows, KPIs, line column) | `facts.containers` |
| Any "x days ago" (BE filed, OOC, waiting) | `daysAgo(iso)` |
| Ship card, ETA from ship tracking | `seaOf(job, data)` from `ships.js`, never `data.seaByJob[...]` directly |
| Shipping line shown anywhere | `displayLine(raw)` |
| Container event names shown anywhere | `eventLabel(raw)` |

## Helpers

### Open jobs

**`isActiveRow(r)`**: `r = { job, j }`. True when the job is open: not delivered by stage
(`stage < 10`) and `j.phase !== 'delivered'` (the trip-aware finished rule).

**`activeRows(rows)`**: `rows.filter(isActiveRow)`. This is `useJourney().active`.

### Free time (detention)

The one source of free days. Free time runs from this trip's port arrival until the
empty is back (or, for jobs the client collects, until the box leaves the CFS). Days are
whole India days, so "free till 2 Nov" and "2 d left" on 31 Oct always agree.

**`freeTimeFor(job, row)`**: one container (`row` = a `container_tracking` row, e.g.
`data.containersByNo[no]`).
Returns `{ left, till, from }` or `null`.
- `left`: free days left. `0` = last free day today, negative = days of detention.
- `till`: the last free day, `'YYYY-MM-DD'` (India date). Format it with the page's `fmtDate`.
- `from`: `'contract'` (job's `free_days` from the port arrival) or `'line'` (the line's own
  count in the last tracking snapshot).
- `null`: not known, no movement for 30+ days (status unclear), or the box is finished.

**`freeDaysLeftFor(job, row)`**: the `left` number only (kept for older code).

**`jobFreeTime(job, data)`**: one job = the container still in play that runs out first.
Returns `{ left, till, containerNo, boxes: [{ no, left, till, from }] }`.
`journeyFor` gives the same answer as `j.freeDaysLeft`, `j.freeTill`, `j.freeBox` (null once
the job is delivered).

**`detentionLevel(left)`**: `'over'` (detention running) | `'risk'` (0-2 left: act today) |
`'soon'` (3-5) | `'ok'` | `null` (not known). Use it for colours: red for over/risk, amber
for soon, grey otherwise.

**`isDetentionRisk(j)`**: `j.freeDaysLeft <= 2` (including detention running). The count of
open jobs at risk is `facts.detention.length`.

### Containers in play

**`containersInPlay(rows, data)`**: open import jobs only (exports skipped). One entry per
container on the job (finished boxes included so a page can show them under "Show finished").
Each entry:

| Field | Meaning |
|---|---|
| `no`, `jobId`, `jobNo`, `client` | the box and its job (show the job number first) |
| `line` | shipping line via `displayLine` (tracking's line first, then the job's) |
| `size` | `job.container_sizes[no]` or tracking's `container_size`, else `null` |
| `tracked` | false when there is no tracking row yet |
| `where` | `'unknown'` (no tracking) / `'not_arrived'` / `'port'` / `'to_cfs'` / `'cfs'` / `'out'` (left with cargo) / `'road'` / `'rail'` / `'collected'` (client took it) / `'empty_back'` |
| `whereText` | plain words: "At CFS", "On the way to the CFS", "Left CFS with cargo", "On the road · KHALAPUR TOLL PLAZA", "Empty back"… |
| `whereSince`, `place` | when it got there (ISO) and the short place name, when known |
| `lastEvent` | `{ label, raw, at, place }` of this trip's newest event, or `null` |
| `portInAt` | this trip's port arrival (ISO) |
| `leftAt`, `leftFrom` | when it left with cargo (ISO) and from `'CFS'` / `'ICD'` / `'port'` |
| `freeLeft`, `freeTill`, `freeFrom` | from `freeTimeFor` (null when not known / finished / stale) |
| `detentionDays` | days of detention so far (0 when none) |
| `level` | `detentionLevel(freeLeft)` |
| `finishedOn` | date the box's work for this job ended (ISO, or `'yes'` when only the status says so), else `null` |
| `stale`, `lastMoveDays` | no movement for 30+ days (put these under "Needs a look"), days since the last event |
| `milestones` | this trip only, oldest first: `[{ label, raw, at, place }]` (`label` is plain words) |

**`containerWhere(row, job)`**: the `where` / `whereText` / `whereSince` / `place` above for
one container: `{ code, label, since, place }`.

**`tripMilestones(row, job)`**: this trip's events in plain words, oldest first.

**`eventLabel(raw)`**: "CFS IN" → "At CFS", "PORT OUT" → "Left port", "TOLL PLAZA CROSSED"
→ "On road (toll)", "STATION CROSSED" → "On rail (station)", EMPTY… → "Empty returned".

**`displayLine(raw)`**: `lineName` plus names it does not know and tidy capitals:
"evergreen" → "Evergreen", "HUNGA A LINE" → "Heung-A Line", "MSC AGENCY(INDIA)PVT.LTD" → "MSC".

### When a container counts as "out"

`containerTrip(row, job)` keeps its contract (`portIn`, `exitAt`, `returnedAt`, `how`,
`laterTrip`) and adds `exitFrom`, `dpd`, `toCfsSince`.
- A CFS / ICD OUT is leaving with cargo (moves between CFSs are skipped, as before).
- A PORT OUT is leaving with cargo only when the box is DPD on this trip, or 48 hours
  have passed with no CFS / ICD IN after it. Within those 48 hours it is "on the way to
  the CFS" (`toCfsSince`), e.g. J-691's PORT OUT at 12:47 am.
- When every box of the job has left with cargo (and every box is tracked), the onward
  move has happened: `j.allLeft` is true, `j.leftAt` is when the last box left, the
  Container out and Truck / rail steps are done ("30 Oct · Left CFS"), `j.readyForTruck`
  is false, the phase is `'truck'` (On the move) and the next step is
  "deliver, then return the empty container" (JDS delivers) or the job is finished
  (client collects).
- The "Container out" step is done only when every box left with cargo (or stage ≥ 9);
  its `sub` says where the boxes are otherwise ("At CFS since 19 Oct", "1 of 2 out").
- While boxes wait at the CFS after OOC with no truck, the next step reads
  "Next: assign a truck" / "Next: arrange truck or rail".

### Trucks

**`onTheRoad(rows, now?)`**: the one "on the road" list. Open import jobs, newest first.
`[{ key, kind, jobId, job, j, truckNo, mode, place, at }]`:
- `kind: 'truck'`: a truck of the job a toll plaza saw in the last 4 days (one entry per truck).
- `kind: 'moving'`: container tracking shows the box on the road (`mode: 'truck'`) or rail
  (`mode: 'rail'`) in the last 4 days, and no toll saw a truck of the job. `truckNo` may be null
  (show a hollow "no truck no." pin at `place`).
- `kind: 'left'`: every box left the CFS loaded in the last 4 days and nothing was seen since.
Count trucks with `.length`, jobs with `jobCount(list)`. Filter `mode === 'truck'` for road only.
Empty list: "No truck on the road · n jobs ready for a truck".

**`needATruck(rows)`**: open jobs with `j.readyForTruck` (OOC done, no truck, not by rail, not
already moving, boxes not all out). The sidebar Trucks badge and the "Ready for a truck" list.

**`jobTruckEntries(rows, now?)`**: every truck on an open job (imports and export carting)
whose trip is not over, seen or not: `[{ key, jobId, job, j, truck, seen }]`. For the automatic
FASTag / papers checks and the truck map list.

**`truckTripOver(r, t, now?)`**: a truck's trip is over 4 days after it was put on the job, or
once its box is finished (`TRUCK_WATCH_DAYS = 4`).

**`jobCount(list)`**: number of different jobs in a list of entries.

### Clients

**`clientKey(name)`**: the key client names are matched by (capitals, punctuation folded).

**`activeJobsByClient(rows)`**: pass all `rows`. Returns
`{ [clientKey]: { key, name, open, total, openJobIds, jobIds } }`. `open` uses `isActiveRow`
(the same set as the 12 open jobs). Match a client_master row with
`byClient[clientKey(row.name)]`, or match by job id with `openJobIds`.

### Ship tracking

**`isOldVoyage(sea, job)`**: a ship tracking row whose arrival (or ETA) is more than 30 days
before the job was opened is about an older voyage (J-673 said "Ship arrived 9 Aug"). Such a
row is ignored for arrival (`j.arrivedAt`), the ship card and `seaOf`.

**`buildSeaByJob(rows, jobs)`**: `sea_tracking` rows → `{ job_id: row }` without old-voyage
rows. `loadJourneyData()` and `patchSea()` already use it.

**`seaOf(job, data)`** (`ships.js`): the job's tracking row or null (old voyages give null).
`shipLineText(sea, job)` and `shipCardText(jobs, sea)` also skip old voyages.

### Days ago

**`daysAgo(iso, now?)`**: whole India days from a date until today (0 = today). A date-only
value is that day in India. Use it for every "BE filed 9 days ago", "OOC 5 d ago", and the
Today KPI averages, so a KPI and a row never disagree. `journeyFor`'s own texts use it too.

### Step dates

Step `when` values ("29 Oct", "29 Sep", year only when not this year) are India dates.
