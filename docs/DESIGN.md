# JDS Portal design system

The one source of truth for how every screen looks and behaves. If a screen
disagrees with this file, the screen is wrong.

## Intent

A precision tool for freight operations: calm, dense, fast, trustworthy. Think
of the best modern operations software (Linear, Stripe Dashboard, Vercel), not a
template. The data is the hero. Chrome stays quiet; colour is spent only where it
carries meaning (status, risk, the one primary action).

**Never:** gradients, glassmorphism, coloured left-border cards, emoji used as
icons, pill-shaped primary buttons, drop shadows on every card, centred marketing
copy, decorative circles, "→" arrows inside button labels, exclamation marks,
JS hover effects (`onMouseEnter` that mutates `style`), hard-coded hex colours in
JSX.

## Foundations

All values are CSS custom properties defined in `src/ui/tokens.css` and mapped
into Tailwind (`tailwind.config.js`). Use the token, never the raw value.

### Colour (light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F7F9` | `#0A0E17` | App canvas |
| `--surface` | `#FFFFFF` | `#10151F` | Cards, panels, inputs |
| `--surface-2` | `#F9FAFB` | `#141A26` | Table headers, subtle fills |
| `--surface-3` | `#F2F4F7` | `#1A2130` | Hover, pressed |
| `--line` | `#E4E7EC` | `#222A3A` | Hairline borders, dividers |
| `--line-strong` | `#D0D5DD` | `#2E3850` | Input borders, emphasis |
| `--fg` | `#0F1729` | `#E7EBF3` | Primary text |
| `--fg-2` | `#475467` | `#B3BCCB` | Secondary text |
| `--fg-3` | `#667085` | `#8590A4` | Muted, meta |
| `--fg-4` | `#98A2B3` | `#5D687D` | Placeholder, disabled |
| `--brand` | `#1F4FAE` | `#5B8DEF` | Primary actions, links, active |
| `--brand-hover` | `#1A4194` | `#7AA3F3` | |
| `--brand-soft` | `#EEF3FC` | `rgba(91,141,239,.14)` | Selected rows, active nav (light) |
| `--brand-fg` | `#FFFFFF` | `#0A0E17` | Text on brand |
| `--accent` | `#F59E0B` | `#FBBF24` | JDS amber (logo line): active indicator, focus of attention. Sparingly. |
| `--ring` | `rgba(31,79,174,.35)` | `rgba(91,141,239,.45)` | Focus ring |

Status tones, each with `-fg`, `-bg`, `-line`: `success` (green), `warning`
(amber), `danger` (red), `info` (blue), `neutral` (grey). Example:
`--danger-fg #B42318 / --danger-bg #FEF3F2 / --danger-line #FECDCA` (light).
Status colour is for state only: never for decoration.

Sidebar (always dark, both themes): `--nav-bg #0B1220`, `--nav-fg #9AA4B8`,
`--nav-fg-strong #FFFFFF`, `--nav-hover rgba(255,255,255,.06)`,
`--nav-active rgba(255,255,255,.10)`, active indicator 2px `--accent` bar.

### Type

- Sans: **Geist Variable** (self-hosted via `@fontsource-variable/geist`).
  Mono: **Geist Mono Variable**. No Google Fonts requests.
- Base 14px / 20px. Scale: 11 (micro label), 12 (meta), 13 (dense table, controls),
  14 (body), 16 (card title), 18 (section), 22 (page title desktop), 28 (stat value).
- Weights: 400 body, 500 labels/controls, 600 titles and numbers. Never 800.
- Headings `letter-spacing: -0.01em` (22px+ `-0.02em`).
- `font-variant-numeric: tabular-nums` on every number column, stat and date.
- Mono for identifiers only: job no, container no, BE/BL/SB/IGM, truck no.
- Micro labels (table headers, section labels): 11px, 500, uppercase,
  `letter-spacing: .04em`, `--fg-3`.
- Sentence case everywhere ("Create job", not "Create Job").

### Space, radius, elevation, motion

- 4px grid. Common gaps 4/8/12/16/24/32. Page padding: 24px desktop, 16px phone.
- Radius: `--r-sm 6px` (chips, small controls), `--r-md 8px` (buttons, inputs),
  `--r-lg 10px` (cards), `--r-xl 14px` (modals, drawers, sheets). Full radius only
  for avatars and status dots.
- Cards are a 1px `--line` border on `--surface`, no shadow. Shadows only on
  things that float: `--shadow-sm` (sticky bars), `--shadow-lg` (menus, popovers,
  modals, drawers).
- Motion 120–200ms, `cubic-bezier(.2,.8,.2,1)`. Drawers slide, modals fade+scale
  .98→1, sheets slide up. Everything disabled under `prefers-reduced-motion`.
- Focus: `:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring) }`.

### Controls

Heights: sm 28px, md 32px (default), lg 40px. On touch screens (`pointer: coarse`)
every interactive control is at least 40px tall, and inputs use 16px text so iOS
does not zoom.

## Layout and responsiveness

Breakpoints: phone `< 640`, tablet `640–1023`, desktop `≥ 1024`, wide `≥ 1440`.

- **Shell** (`src/industrial/Shell.jsx`) frames every signed-in role (admin,
  employee, field ops):
  - Desktop: dark sidebar 240px (collapsible to a 64px icon rail, remembered),
    56px top bar with the search (Ctrl K), primary "Create job", bell, theme toggle,
    user menu.
  - Tablet: sidebar starts as the 64px icon rail.
  - Phone: no sidebar; compact top bar; bottom tab bar (4 role-specific tabs +
    More) with safe-area padding; "More" opens a full-height drawer.
- Content uses the full width up to 1600px. Pages start with a **PageHeader**:
  title (22px desktop / 18px phone), optional one-line description, actions on
  the right (they wrap below on phone).
- Tables on desktop; on phone the same data becomes a stacked list of rows
  (one responsive tree via CSS, or `useMediaQuery` to mount only one tree; never
  mount both a desktop and a mobile tree and hide one with CSS).
- Filters: a toolbar that wraps on tablet and becomes a horizontally scrollable
  chip row on phone. Search inputs go full width on phone.
- Modals: centred dialog on desktop (max 560/720/960px), bottom sheet on phone.
  Drawers: right side on desktop (min(560px, 100vw)), full screen on phone.
- No horizontal page scroll at any width from 320px up. Wide tables scroll inside
  their own container.

## Components

React primitives live in `src/ui/` and are exported from `src/ui/index.js`. CSS
classes are `ix-*` in `src/ui/components.css` (global, not scoped). Prefer the
React primitive; use the class when a primitive does not fit.

| Primitive | Notes |
|---|---|
| `Icon` | `<Icon name="truck" size={16} />`: Tabler icon names, tree-shaken SVG. |
| `Button` | `variant`: primary, secondary (default), ghost, danger. `size`: sm, md, lg. `icon`, `iconRight`, `loading`. One primary per view. |
| `IconButton` | Requires `label` (aria-label + tooltip). |
| `Badge` | `tone`: neutral, brand, success, warning, danger, info. `dot`, `icon`. 22px tall, `--r-sm`. |
| `Card` | `Card`, `Card.Header` (title, description, actions), `Card.Body`, `Card.Footer`. |
| `Stat` | Label, value (28px, tabular), delta/hint line, optional tone. |
| `PageHeader` | `title`, `description`, `actions`, optional `back`. |
| `Toolbar` | Wraps filters/search/actions with consistent gaps. |
| `Input`, `Textarea`, `Select`, `Field` | `Field` gives label, hint, error. Native `<select>` styled. |
| `SearchInput` | Leading search icon, clear button, `/`-style hint optional. |
| `Tabs` / `Segmented` | Underline tabs for page sections; segmented control for small toggles. Both scroll horizontally on phone. |
| `Table` | `.ix-table`: sticky header, 44px rows (36px compact), hover, numeric columns right-aligned. |
| `Modal`, `Drawer` | `role="dialog"`, `aria-modal`, Esc closes, focus trapped and returned, backdrop click closes (unless a form is dirty). Sheet on phone. |
| `EmptyState` | Icon, title, one sentence, optional action. Never a bare "No data". |
| `Skeleton`, `Spinner` | Skeletons for first loads; spinner only inside buttons/small areas. |
| `Avatar` | Initials on `--brand-soft`. |
| `Kbd` | Keyboard hint, hidden on touch. |
| `toast()` | Bottom-right desktop, bottom-centre above tab bar on phone. |

Hooks: `useMediaQuery(query)`, `useIsPhone()`, `useTheme()` (light / dark /
system, saved in localStorage `jds_theme`, applied as `data-theme` on `<html>`).

## Writing

Short, specific, operator language. Keep the domain terms staff use: BE, OOC,
BL, IGM, SB, LEO, CFS, ICD, LDB, ULIP, FASTag, detention, free days. Dates
`31 Oct`, times `14:05`, relative times "3 h ago". Empty states say what will
appear and how to make it appear.

## Accessibility

Every control is a real `<button type="button">`, `<a>` or form element. Icon-only
buttons have `aria-label`. Inputs have labels. Colour is never the only signal
(pair with text or icon). Contrast AA. Dialogs trap focus. The app works with the
keyboard alone.

## Performance rules

- Pages and heavy features are code-split (`React.lazy` / dynamic `import()`):
  xlsx, pdfjs, maps and every dashboard tab.
- One pdf.js worker import path for the whole app.
- No component tree mounted twice for responsiveness.
- Static assets are hashed and cached for a year; `index.html` and `sw.js` are
  never cached.
