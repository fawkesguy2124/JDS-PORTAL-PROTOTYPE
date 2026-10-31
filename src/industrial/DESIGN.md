# JDS portal design system: "Control tower"

Chosen by Jose on 31 Oct 2026. Reference mockup: `prototypes/design-directions/direction-1.html`
in the prototype repo. Tokens and classes live in `src/industrial/industrial.css` (all under `.ix`),
components in `src/industrial/ui.jsx`.

Principles: dense and calm. 13px working type, 32px table rows, hairlines instead of cards,
tabular figures everywhere, colour only for status. Light theme for every working surface
(the navy sidebar is the only dark part). Real data only: if the data does not have a fact,
leave it out.

## Page contract

`AdminDashboard.jsx` mounts every page inside one frame:

```jsx
<div className="ix-page">            {/* or "ix-page ix-page-wide" for Vessels */}
  <YourPage {...ixProps} />
</div>
```

So a page renders **only** its `PageHead` and its content. No outer padding, background,
`max-width` or `<h1>` of its own. (A page that still wraps itself in `.ix-page` gets its
padding removed by `.ix-page .ix-page`, but drop the wrapper when you rebuild.)

- The top bar already has **Create job**: never add a second one in a page head.
- Job numbers first, everywhere, with `<JobNo>`. Then the client.
- Never show vendor or system names on screen: no ULIP, LDB, Safecube, ICEGATE, FASTag.
  Sources are Customs, Port, Toll, Staff, WhatsApp. LiveImpex only as the place to file a BE.
- Rows, map pins and lists are labelled by job number, never by ship name. The ship name and
  IMO appear only in the job panel's ship card.
- Never add automatic government checks. A check that runs on a button press stays that way.
- **One primary button per view** (page, panel or drawer). Everything else is secondary or ghost.
- Phone (375px): the page must not scroll sideways. Wide tables scroll inside `.ix-tbl-wrap`.

## Tokens (CSS variables on `.ix`)

### Colour

| Token | Value | Use |
|---|---|---|
| `--navy` | #1a4fa0 | primary button, links, selected, "moving / in progress" |
| `--navy-700` | #153f80 | primary hover |
| `--navy-900` | #0e2650 | sidebar and brand cell only |
| `--navy-50` / `-100` / `-200` | #eef3fb / #dce6f6 / #b8cbec | selected row and KPI, set filter, light bars |
| `--accent` / `--accent-600` / `--accent-50` | #f5a524 / #d48806 / #fef6e6 | **brand amber, accent only**: logo bar, active nav marker, focus ring, today line, selected map pin. Never a warning. |
| `--bg` | #f3f5f8 | app canvas |
| `--surface` | #fff | panels, tables |
| `--surface-2` | #f8f9fb | table head, toolbar, hover |
| `--surface-3` | #eff2f6 | segmented track, count pills |
| `--line` / `--line-2` | #e3e7ed / #d3d9e2 | hairlines / inputs and stronger dividers |
| `--text` / `--text-2` / `--muted` / `--faint` | #101828 / #475467 / #8792a5 / #b6bfcc | body / secondary / meta / dashes and disabled |

Status hues, each with a tint (`-bg`) and a border (`-line`):

| Tone | Text | Dot | Means |
|---|---|---|---|
| red | `--red` #c81e1e | same | act today, overdue, detention, problem |
| amber | `--amber` #b45309 | `--amber-dot` #e38a09 | needs action soon (To move, Waiting OOC, missing data) |
| green | `--green` #16803c | same | **delivered / done only** |
| teal | `--teal` #0f766e | same | at port, calm states that need nothing |
| blue | `--blue` = navy | same | moving, in progress (at sea, on the road) |
| grey | `--grey` #8792a5 | `--faint` | not started, no data yet |

Old names still work (`--radius`, `--blue-bg`, `--grey-bg` …) so pages not yet rebuilt render.
Do not add raw hex colours in page code: use a token.

### Type

`--font` Inter (already loaded), `--mono` system mono stack
(`ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace`). Tabular figures are on for
the whole app.

| Token | Size | Use |
|---|---|---|
| `--fs-xs` | 11px | caps labels, table head, tags |
| `--fs-sm` | 12px | meta, sub-lines, status labels |
| `--fs-md` | 13px | body and tables (the working size) |
| `--fs-lg` | 15px | empty-state titles |
| `--fs-xl` | 20px | page title (600, -.015em) |
| `--fs-kpi` | 24px | KPI values (600, tabular) |

Mono (12px) for BE, BL, container and truck numbers: `className="mono"`. Job numbers use `<JobNo>`.

### Shape, space, layout

- Radii: `--r-sm` 4px (tags, kbd, small buttons), `--r-md` 6px (buttons, inputs, nav items),
  `--r-lg` 8px (panels, menus, toasts). No other radii.
- Borders: 1px only. Shadows only on things that float: `--shadow-pop` (menus, palette, toast),
  `--shadow-panel` (job panel).
- Focus: `--focus` (amber ring) on every focusable control.
- Spacing (4px grid): `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 20, `--s6` 24, `--s8` 32.
  Gap between stacked panels: 12px (`--s3`).
- Layout: `--top` 48px top bar, `--nav` 212px sidebar (56px collapsed), `--row` 32px table row
  (28px in compact mode, set from the avatar menu), `--row-head` 30px table head.

## Formats (ui.jsx)

| Helper | Output |
|---|---|
| `fmtDate(iso)` | `29 Oct`, `29 Sep` (never Sept), `3 Jan 2027` (year only when not this year), IST |
| `fmtTime(iso)` | `18:20` (24 h IST); empty for a date-only value |
| `fmtDateTime(iso)` | `31 Oct, 18:20` |
| `fmtINR(n)` | `₹4,82,310` |
| `timeAgo(iso)` | `5 min ago`: use only in tooltips, show absolute times on screen |
| `<Dash />` | the muted `—` for a missing value (sort it last in both directions) |

## Components

All from `import { … } from '../ui'` (or `'./ui'`).

### PageHead

`title`, `sub` (string, node, or an array joined with ` · `), `actions` (right side).

```jsx
<PageHead title="All jobs"
  sub={[`${open} open`, `${risk} at detention risk`, `${move} to move`]}
  actions={<Segmented options={['All', 'Import', 'Export']} value={kind} onChange={setKind} />} />
```

### Button

`variant`: `primary` | `secondary` (default) | `ghost` | `danger`; `size="sm"`; `icon`;
`urgent` (with primary: red fill, only on an "act today" row). Other props go to `<button>`.
Classes: `.ix-btn`, `.ix-btn.primary`, `.ix-btn.ghost`, `.ix-btn.danger`, `.ix-btn.sm`.
Actions are verbs that say what they do: "Assign truck", "Update BE stage", not "Open".

```jsx
<Button variant="primary" icon="truck" onClick={assign}>Assign truck</Button>
<Button size="sm" icon="refresh" variant="ghost">Refresh</Button>
```

Icon-only: `<button className="ix-icon-btn" aria-label="Close"><Icon name="x" /></button>` (`.sm` = 26px).

### KpiStrip / Kpi

One hairline box, cells split by 1px lines; wraps to 2 per row on a phone.
`Kpi` props: `label`, `value` (null shows a faint dash), `unit` (small text after the value),
`sub` (one actionable line), `tone` (red | amber | green | teal | blue | grey: colours the
**value only**), `dot` (a tone for a small dot before the label), `onClick` (makes it a filter
with a hover chevron), `selected` (navy-50 with a navy underline), `title`.

```jsx
<KpiStrip>
  <Kpi label="Active jobs" value={active.length} sub={`${boxes} containers open`} />
  <Kpi label="Free days ≤ 2" dot="red" tone={risk.length ? 'red' : undefined} value={risk.length}
    sub={first && <><JobNo no={first.job_no} /> free till {fmtDate(first.till)}</>}
    onClick={() => setFilter('risk')} selected={filter === 'risk'} />
</KpiStrip>
```

Show grey zeros (no tone when the value is 0). No deltas until real history exists.

### JobNo

`no` (or `job`), `onClick` (renders a button and stops the row click), `size` (`sm` | `lg`), `title`.
600 13px mono; `lg` = 20px for the job panel title.

```jsx
<td><JobNo no={job.job_no} onClick={() => onOpenJob(job.id)} /></td>
```

### Status / PhaseStatus / Chip

`<Status tone="amber" sub="5 d">To move</Status>`: 7px dot + 12px label. `pill` adds a tint
(only for the stage cell of a wide table). `.ix-st.hollow` = hollow dot (no tracking yet).
`<PhaseStatus job={job} j={j} />` is the job's stage as a Status (tones: Ship due blue,
BE to file grey, Waiting OOC amber, To move amber, On the move blue, Delivered green).
`<Chip tone="red" icon="clock">Day 9</Chip>`: a small tag for extra facts on a row
('+ arrange truck', 'OOC date missing'). `PhaseChip` still exists for old pages.
`<span className="ix-dot amber" />` is a bare dot.

### FreeDays

`value` (days left, null = dash), `till` (date text, optional). Shows `13 d`, `Today`,
`3 d over` (red fill); red at ≤ 2, amber at ≤ 5, plain otherwise. Put it in a right-aligned cell.

```jsx
<td className="r"><FreeDays value={j.freeDaysLeft} till={j.freeTill && fmtDate(j.freeTill)} /></td>
```

### Tabs

`tabs = [{ id, label, count, tone: 'red' | 'amber', icon }]`, `value`, `onChange`.
Navy underline on the active tab; its count turns navy.

```jsx
<Tabs value={view} onChange={setView} tabs={[
  { id: 'all', label: 'All', count: rows.length },
  { id: 'action', label: 'Needs action', count: action.length, tone: 'red' },
]} />
```

### Segmented

`options` (strings or `{ value, label }`), `value`, `onChange`, `label` (aria). For a 2–3 way
switch in a page head or panel (Import | Export, Truck | Rail). Not for filters with counts.

### Toolbar, SearchBox, FilterSelect

`<Toolbar search onSearch placeholder filters right>{children}</Toolbar>`; `filters` is
`[{ key, label, value, onChange, options }]` where the first option is the "all" choice with
value `''`. A set filter turns navy-50. `SearchBox` (`value`, `onChange`, `placeholder`,
`width`, `inputRef`) and `FilterSelect` (`label`, `value`, `onChange`, `options`) work on their own.

```jsx
<Panel flush>
  <Tabs … />
  <Toolbar search={q} onSearch={setQ} placeholder="Job, client, BE, BL, container"
    filters={[{ key: 'mode', label: 'Mode', value: mode, onChange: setMode,
      options: [{ value: '', label: 'All' }, 'Sea FCL', 'Sea LCL', 'Air'] }]} />
  <div className="ix-tbl-wrap">…table…</div>
</Panel>
```

### Panel / Section

`<Panel title meta actions flush className>`: a white hairline box with a 40px title row
(13px 600 title, muted meta, actions on the right). `flush` (default true) puts children edge to
edge (tables, lists); `flush={false}` pads them 12px 16px. Stacked panels get 12px between them.
`<Section title right>`: an 11px caps title over content, for groups inside a panel or the job panel.

### EmptyState

`icon`, `tone` (green = all clear, grey = nothing yet, others for emphasis), `title`, children
(one line of explanation), `action` (one button), `line` (a compact single row instead of a block).

```jsx
<EmptyState icon="shield-check" tone="green" title="No containers at risk" />
<EmptyState line icon="truck" title="No truck on the road ·" action={<button className="ix-link" onClick={…}>7 jobs ready for a truck →</button>} />
```

### Others kept from before

`Icon` (`name`, `className`, `style`; Tabler names without `ti-`), `Owner`, `worst`,
`timeAgo`, `Sparkline`, `jobOwnerName`, `initials`, `Skeleton` (`rows`), `phaseChip`.
`AutoStatus` (default export of `AutoStatus.jsx`) is the one-line "updating by itself" status
under a page title; `useSystemHealth`, `healthTones` and `autoCheckLine` from the same file give
the background-service state the sidebar uses.

## Patterns

### Dense table (`.ix-tbl`)

```jsx
<div className="ix-tbl-wrap" style={{ maxHeight: 'calc(100vh - 260px)' }}>
  <table className="ix-tbl click">
    <thead><tr>
      <th className="lvl" /><th>Job</th><th>Client</th><th>Status</th>
      <th className="r sort sorted">Free days <Icon name="arrow-up" /></th><th>Updated</th>
    </tr></thead>
    <tbody>
      {rows.map((r) => (
        <tr key={r.id} className={`${r.level} ${r.id === sel ? 'sel' : ''}`} onClick={() => open(r.id)}>
          <td className="lvl" />
          <td><JobNo no={r.job_no} /></td>
          <td className="cl">{r.client}</td>
          <td><PhaseStatus job={r.job} j={r.j} /></td>
          <td className="r"><FreeDays value={r.j.freeDaysLeft} /></td>
          <td className="mono dim">{fmtDateTime(r.updated_at)}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

- 30px sticky head (11px caps, muted), 32px rows, 1px dividers, hover `--surface-2`,
  selected row `tr.sel` (navy-50).
- `.click` on the table = pointer rows. `th.sort` / `th.sorted` for sortable headers, with a
  12px `arrow-up` / `arrow-down` icon; `.hint` shows a faint icon on hover.
- Numbers and days right-aligned: `th.r` / `td.r` (tabular). Mono cells: `td.mono`.
  Muted cells: `td.dim`. Client cell with ellipsis: `td.cl`. Two-line cell: `td.wrap`.
- Level edge: first cell `.lvl` plus `tr.red` / `tr.amber` draws a 3px left edge.
- Group row: `<tr className="grp"><td colSpan={n}>Truck not arranged <span className="n">6</span></td></tr>`.
- Row actions that appear on hover: wrap them in `.row-act` (always shown on touch screens).
- Footer: `.ix-tbl-foot` (counts left, `.right` for paging).
- The sticky head sticks inside `.ix-tbl-wrap`; give the wrapper a `max-height` when the list is long.
- One row per job at its worst level; extra problems become `Chip`s on the same row.

### KPI strip

Up to 7 tiles in one `KpiStrip`, each a filter for the list below when that helps. One number,
one source: a KPI, a sidebar badge, a tab count and a pipeline figure for the same thing must
come from the same list (`useJourney()`).

### Panel layout

Panels are flat (`.ix-card`): white, 1px `--line`, 8px radius, no shadow. Put a table or list
straight inside (flush). Grids of panels: `display: grid; gap: 12px` (`.ix-grid-2` is 1.6fr / 1fr
and stacks under 1180px).

### Colour rules

- Red: act today, overdue, detention, a real problem. Red fill only on an "act today" row button.
- Amber (status amber, never `--accent`): needs action soon; action counts in the sidebar.
- Green: delivered or done, nothing else ("OOC granted" is amber "To move").
- Teal: at port and other calm states. Blue/navy: moving, in progress.
- Grey: not started or no data. Zero values are grey, not red.
- Brand amber `--accent`: accent only (logo bar, active nav, focus ring, today line, selected pin).

## Shell (Shell.jsx)

- Navy sidebar with section labels, an amber active marker, count badges (neutral; red for
  urgent; status-amber tint for action counts). `counts[id]` is a number or `{ n, tone, title }`.
- Footer: automatic checks "Last check 19:40 · next 20:40" (IST) from `system_health`, read at
  most once a minute; green / amber / red dots on WhatsApp bot and System health.
- Top bar: page name, search (Ctrl K opens the palette), Create job (the one primary), bell,
  avatar (name and role; menu with Compact rows, Install app, Log out).
- Collapsible sidebar (remembered per computer); on phones a bottom tab bar and a "More" menu.
