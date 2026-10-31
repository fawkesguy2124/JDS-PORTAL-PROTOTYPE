# JDS Portal: simplified flow (proposal v2)

## Principles (from how leading freight software is built)

1. **The job list is home.** Each row says, in plain words, where the job is and
   what's pending. Sorted so urgent jobs come first. No separate task page.
2. **One job page, organised by milestones.** A shipment is a sequence of steps
   (arrival → documents → BE → OOC → transport → delivered). The page follows
   that sequence. Each step shows its own data, and the action for a step
   appears *on that step* when it's pending ("Record OOC" sits on the OOC step).
3. **Show only what applies.** Air jobs don't show containers; exports show SB/LEO
   instead of BE/OOC; steps not reached yet stay collapsed.
4. **Details on demand.** Raw ULIP results, every field, full history: one click
   away, never on the main view.
5. **Automations stay in the background.** No "Refresh all" or "Check now"
   buttons in daily use; just "updated 5 min ago".

References: Flexport shipment page (central milestone timeline, customs as
milestones, documents/details/history in a side menu, sections hidden when not
relevant), Logixboard/CargoWise (status bar + current-milestone summary,
per-container milestones, documents/notes/activity tabs), Shippabo (Details /
Activities / Documents tabs), ERPNext and Odoo freight modules (list → record).

## Navigation

| Role | Today | Proposed |
|---|---|---|
| Desk staff | 9 items | **Jobs · Clients** |
| Field ops (phone) | 5 items | **Trucks · Jobs** |
| Owner | 15 items | **Dashboard · Jobs · Clients · Manage** |

Always available: search bar (Ctrl K: job, client, container, BE, BL, truck),
**Create job**, notifications bell.

## Screens

### Jobs (home for desk staff)
- Views as tabs: **Active** (default) · **Mine** · **Waiting OOC** · **On the
  road** · **Detention risk** · **Closed**.
- Columns: Job · Client · Status · Free days · ETA · Owner.
- **Status** is one plain sentence that includes what's pending: "BE filed 4 d
  ago · waiting OOC", "Customs query, reply needed", "OOC received · no truck".
  A red/amber dot marks rows needing action; those sort to the top.
- One search box and a mode filter (Sea / Air / Export). Export to Excel in a menu.
- Click a row: job page as a side panel (desktop) or full screen (phone).

### Job page
**Header:** J-709 · TRW · Sea FCL · owner · free days countdown · plain status
line. Under it a slim 6-step stage bar.

**Tabs (4):**
1. **Progress** (default): the milestone timeline.
   - Done steps: one line each (date, key number, who).
   - Current step: expanded with its data and its action button.
   - Future steps: greyed, one line.
   - Steps hold their details: *Arrival* expands to vessel, ETA and each
     container's status; *BE* to BE no, duty, assessment and ULIP checks
     (folded); *Transport* to trucks, driver, FASTag location.
2. **Documents:** list with type and date, preview, upload (camera on phone),
   extract.
3. **Details:** all job fields, editable by permission.
4. **History:** every change, automatic and manual, searchable.

On desktop a narrow right column keeps the essentials visible on every tab: BL,
BE, containers (number + status), shipping line, CFS.

### Trucks (home for field ops, phone first)
- Today's moves as cards: truck no · container · from → to · status.
- Big buttons on each card: **Left CFS**, **Delivered**, **Add photo** (EIR,
  LR, challan go straight into that job's documents).
- Tap the card for the job page.

### Dashboard (owner only)
- A strip of counts that are links into Jobs views: Active · Waiting OOC ·
  On the road · Detention risk.
- **At risk:** jobs with ≤ 2 free days or stuck OOC (same rows as Jobs).
- **Team:** open jobs per person, overdue count.
- **Ships at sea:** small map, collapsed by default.

### Clients
Client list → client's jobs (existing Clients page, simplified).

### Manage (owner only)
WhatsApp bot preview, system health, raw ULIP lookup, team.

## Where today's pages go

| Current | New home |
|---|---|
| Today (admin + employee) | Jobs (Active view) / Dashboard (owner) |
| Containers, Vessels | Job page → Arrival step; Dashboard ship map |
| Trucks | Field: Trucks. Desk: Jobs "On the road" + job page → Transport step |
| BE & OOC (both versions) | Jobs "Waiting OOC" + job page → BE / OOC steps |
| Documents | Job page → Documents |
| Detention | Jobs "Detention risk" + Dashboard |
| Search anything | Search bar (Ctrl K) |
| Team & stages | Dashboard → Team |
| WhatsApp bot, System health, ULIP lookup | Manage |
| Payments, BIS & Licences | Removed (placeholders with sample data) |
| Job drawer + full job page | One job page |

## Flows: before → after

| Task | Before | After |
|---|---|---|
| Owner's morning check | 5 pages | Dashboard |
| Record OOC | BE & OOC page → find → open → stage | Jobs "Waiting OOC" → job → **Record OOC** on the step |
| Find a container | Containers page → filter | Ctrl K → number |
| Field marks delivered | Menu → Trucks → find → button | Trucks → **Delivered** |
| Photo of a document | Menu → Documents → job → upload | Trucks card → **Add photo** |

## Unchanged

Data, permissions (who records BE, changes stages, extracts documents),
automations, WhatsApp bot, alerts, business rules. Old `?tab=` links redirect to
the new places.
