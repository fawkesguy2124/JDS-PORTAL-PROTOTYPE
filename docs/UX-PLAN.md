# JDS Portal: simplified flow (proposal)

## The idea

People don't come to the portal to browse pages. They come to answer one
question: **"What do I need to do now?"** Then they do it and leave.

So the portal becomes three things:

1. **My work**: a short list of the jobs that need *me* today, each with the one
   next step as a button. When it's done, the item disappears.
2. **One job page**: everything about a job in one place (containers, customs,
   trucks, documents, history). No more separate Containers, Vessels, Trucks,
   BE & OOC and Documents pages showing slices of the same job.
3. **Search**: type any job no, client, container, BE, BL or truck number and go
   straight to it.

Everything the automations already do (container tracking, ship positions,
customs status, ULIP checks) runs in the background and only shows up when
something needs a person.

## Navigation

| Role | Today: menu items | Proposed |
|---|---|---|
| Desk staff | 9 | **My work · Jobs · Clients** (+ Create job, Search) |
| Field ops | 5 | **Today · Jobs · Upload** (phone tabs) |
| Owner | 15 | **Overview · My work · Jobs · Clients** + a small **Manage** area |

Removed from the menu (still reachable where needed):

| Current page | Where it goes |
|---|---|
| Today (two versions) | **My work** (staff) / **Overview** (owner) |
| Containers, Vessels | Job page → *Containers & ship* section. Jobs list view "At sea / at port". Ship map stays as one card on Overview. |
| Trucks | Field: **Today**. Desk: job page → *Trucks*, Jobs view "On the road". |
| BE & OOC | **My work** (Record BE, Mark OOC appear there) + Jobs view "Waiting OOC" |
| Documents | Job page → *Documents* (upload, preview, extract). Field: **Upload** tab. |
| Detention | Jobs view "Detention risk" + Overview card |
| Search anything / ULIP lookup | The search bar (Ctrl K). Raw ULIP lookup → Manage. |
| Team & stages | Overview → *Team* card |
| WhatsApp bot, System health | **Manage** (owner only) |
| Payments, BIS & Licences | **Removed.** They are placeholders with sample data and "Coming soon". They come back when they are real. |
| Density toggle, Install app, Refresh-all buttons | User menu (install), automatic (refresh). Density toggle removed. |

Old links (alerts, WhatsApp bot messages, bookmarks with `?tab=...`) keep working
and land on the new place.

## Screens

### My work (desk staff home)
- Two groups: **Today** and **Coming up**. Nothing else on the page.
- Each row: dot (red/amber) · **J-709 · TRW** · what's needed ("Customs query,
  reply needed", "2 free days left", "OOC received, arrange truck") · **one
  button** (Record BE / Mark OOC / Assign truck / Open).
- Only *my* jobs by default; a small toggle "Everyone" for cover.
- Empty state: "You're clear. New tasks show up here automatically."

### Overview (owner home)
- One line: 12 active · 3 at detention risk · 5 waiting OOC (each clickable).
- **Needs attention across the team** (same rows as My work, with the owner's name).
- **Team**: who has how many open jobs and anything overdue.
- **Ships at sea**: small map card, collapsed by default.
- That's all. Five KPI tiles, the pipeline chart and the latest-updates feed go;
  the feed lives in each job's history.

### Jobs
- One table. Saved views as tabs: **Needs action · Mine · Waiting OOC · On the
  road · Detention risk · All**.
- Six columns only: Job · Client · Stage · Next step · Free days · Owner.
- One search box and one filter (Import / Export / Air). Excel export in a menu.
- Clicking a row opens the job page as a side panel (desktop) or full screen
  (phone). On phone the table becomes simple rows with 3 facts.

### Job page (the canonical record)
- **Header:** job no, client, mode, owner, free days. A 6-step progress line
  (Arrival → Documents → BE → OOC → Transport → Delivered).
- **Next step card:** the one action for the current stage, big and obvious.
- **Sections** (tabs): Overview (key fields, editable by permission) ·
  Containers & ship · Customs (BE, duty, OOC; ULIP checks folded away) ·
  Trucks · Documents · History (every change, automatic and manual).
- Replaces both today's job drawer and the separate full job page.

### Field app (phone first)
- **Today:** my moves and trucks for today as big cards: truck no, container,
  from → to, and two big buttons (*Left CFS*, *Delivered*). Works with one thumb.
- **Jobs:** search and the same job page.
- **Upload:** pick the job, take a photo (EIR, LR, challan), done.

### Manage (owner only)
Users and permissions overview, WhatsApp bot preview, system health, raw ULIP
lookup. Out of everyone's way.

## Key flows: before → after

| Task | Before | After |
|---|---|---|
| Owner's morning check | Today → Detention → BE & OOC → Trucks → Containers (5 pages) | Overview (1 page) |
| Record OOC | BE & OOC page → find job → open → change stage | My work → **Mark OOC** (1 click + confirm) |
| Find a container | Containers page → scroll/filter | Ctrl K → type number → job page |
| Field marks delivered | Menu → Trucks → find row → button | Today → **Delivered** |
| Upload a document from phone | Menu → Documents → find job → upload | Upload tab → job → photo |

## What stays exactly the same

Data, permissions (who can record BE, change stages, extract documents),
automations, WhatsApp bot, alerts, the job number formats and all business rules.
This is a change to how the app is organised, not to what it does.

## Rollout

1. Build behind the same login on the `redesign` branch; preview link for review.
2. Old `?tab=` links redirect to the new places.
3. Go live after the owner and one desk user have tried it for a day.
