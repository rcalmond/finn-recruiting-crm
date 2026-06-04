# Handoff: Today v5 (Finn Recruiting CRM)

**Status:** Design locked. Ready for implementation.
**Scope:** `Today` view only. School detail, Schools list, Library, Campaigns are OUT OF SCOPE for this iteration.

---

## 1. About the design files

The HTML + JSX files in this folder are **design references**, not production code to ship verbatim. The task is to recreate them in the existing `rcalmond/finn-recruiting-crm` codebase using its established patterns:

- Next.js App Router (server components for data fetching, `'use client'` for interactivity)
- Tailwind CSS with the existing token aliases in `tailwind.config.js`
- The existing component split: `TodayClient.tsx` orchestrates, section components own their UI
- Existing data shape from the current scoring engine — no schema changes

Inline-styled values in the JSX should be translated to Tailwind classes consistent with the rest of the codebase.

**Fidelity:** High — final colors, typography, spacing, and copy are decided. Recreate pixel-accurate.

---

## 2. Critical implementation constraints

These are non-negotiable. They override anything implied by the visual reference.

1. **Strategic prompts are FIXED.** The four prompts already in v1 are: `reel_coverage`, `rq_refresh`, `stale_tier_a`, `pipeline_shape`. Do NOT invent new prompts. Any prompt content shown in the mockup beyond those four (e.g., "Three Tier A schools haven't heard from you") is illustrative ONLY — copy lives in the existing strategic prompts service.
2. **Tactical card color is by rank, not by type.** Card 1 (rank 1) is always red regardless of whether it's `inbound_awaiting`, `going_cold`, or `action_item`. Urgency-type colors are gone.
3. **Cards 2 and 3 are visually identical** except for the rank numeral (`2` vs `3`).
4. **Pipeline rail caps at 10 visible schools**, sorted by status priority (HOT → ACTIVE → WARMING → COLD), filtered to active Tier A and B only.
5. **Mobile pipeline stacks at the bottom of Today only.** It does NOT appear on Schools, Library, or any other page.
6. **Recently handled section keeps existing Done/Undo behavior** — wire to existing actions, don't reimplement.
7. **School detail page is OUT OF SCOPE** for this iteration. Only Today gets redesigned.

---

## 3. Files in this bundle

- `Finn Soccer - Today v5.html` — host page that mounts the design canvas
- `today-v5.jsx` — all React components (source of truth for the design)
- `design-canvas.jsx` — pan/zoom canvas wrapper (review-only, not part of production)

---

## 4. Design tokens

All tokens already exist in `tailwind.config.js`. No new tokens needed.

### Colors

```
paper:    #F6F1E8   page ground
paperDeep:#EFE8D8   mobile pipeline rail ground
ink:      #0E0E0E   primary text + caught-up bg
inkSoft:  #1F1F1F
inkMid:   #4A4A4A   body text
inkLo:    #7A7570   tertiary text
inkMute:  #A8A39B   captions, dividers, metric mute dots
line:     #E2DBC9   hairlines
line2:    #D3CAB3   stronger dividers
red:      #C8102E   tactical accent + hero #1 fill + overdue metric
redInk:   #FFE4E8   soft text on red
teal:     #00B2A9
tealDeep: #006A65   strategic card fill + active metric
tealInk:  #E6F7F5   soft text on teal
gold:     #F6EB61
goldDeep: #C8B22E
goldText: #8A6F0E   "this week" metric
```

### Typography

- **Family:** Inter (already loaded via `next/font` or equivalent in the codebase). Weights used: 400, 500, 600, 650, 700, 800. Italic variants used for display.
- **Display (italic 700):** masthead `Today.`, section titles, tactical hero text, strategic question, caught-up `Caught up.`, rank numerals
- **Body (450–500):** preview text, summary text
- **Tabular nums** on all numeric metric values
- **Letter-spacing:** `-0.04em` on masthead, `-0.035em` on display, `-0.03em` on hero text, `+0.18em` on 11px caps kickers, `+0.24em` on 10px caps kickers

### Spacing

- Card border-radius: 16 (tactical, caught-up), 14 (strategic, pipeline card), 10 (handled rows), 8 (sidebar nav rows), 999 (pills)
- Card padding: 26×30 (hero), 22×26 (compact tactical, strategic), 40×32 (caught-up), 12×16 (handled), 12×4 (pipeline rows)
- Hairlines: 1px `line`. Hero top rule: none (hero uses red fill instead). Pipeline group dividers: 1px `line`.

### Shadows

- Hero: none (red fill carries weight)
- Compact cards: none, just 1px `line` border
- Buttons: none
- Box-shadow `0 1px 0 rgba(0,0,0,0.02)` only if needed for visual seat

---

## 5. Responsive breakpoints

Single breakpoint at `md` (768px), matching existing Tailwind config:

- **≥ md (desktop reference: 1440px):** 3-column grid — Sidebar (232px fixed) · Main (flex 1) · Pipeline Rail (320px fixed). Mobile bottom nav hidden.
- **< md (mobile reference: 390px):** Sidebar hidden, main full-width, Pipeline Rail moves to a full-width section at the bottom on `paperDeep` ground. Bottom nav fixed at viewport bottom.

The 1440 and 390 reference widths are presentation sizes for the mockup. The implementation must be fluid — use `clamp()` and Tailwind responsive utilities, not fixed pixels.

---

## 6. Section specifications

### 6.1 Sidebar — `AppNav.tsx` (already exists, no changes)

Production already has Today / Schools / Campaigns / Library / Tools nav with correct active state. **Do not modify.**

### 6.2 Masthead

- Title: `Today.` — italic Inter 700, `clamp(56px, 7vw, 88px)`, letter-spacing -0.04em, color `ink`, line-height 0.95.
- Metric line below (10px gap from title): three nowrap chunks separated by `inkMute` `·`:
  - `{overdue} overdue` — number `red` 700 tabular-nums, label `inkLo` 500. Renders only when `overdue > 0`.
  - `{active} active` — number `tealDeep` 700 tabular-nums, label `inkLo` 500. (`active = inbound_awaiting count`)
  - `{week} this week` — number `goldText` 700 tabular-nums, label `inkLo` 500. (`week = going_cold count + upcoming-7d action items`)
  - **Each chunk wrapped in `whiteSpace: nowrap`** so they don't break across lines.
- Date kicker (10px gap below metrics): `{Day}, {Date}` — 11px caps, weight 800, letter-spacing 0.18em, color `inkLo`. Format: `Friday, May 1`.

### 6.3 Tactical — rewrite `TacticalSection.tsx`

Section header: kicker rule (top border-2 `inkLo`, padding-top 4) + 11px-caps `TODAY` + italic title `Your top {n}.` (24px, italic, ink). When `n === 0`, replace cards with caught-up state (§ 6.4) and use title `Your top 3.`.

Three cards in vertical stack with **14px gap**. Hierarchy is by rank — color is unified red across all three.

#### Hero card (rank 1)

```
position: relative
background: red
border-radius: 16
padding: 26 30
overflow: hidden
```

**Watermark numeral** (decorative, absolute):
```
right: 28, top: 8
font: italic 800 180px Inter
letter-spacing: -0.06em
line-height: 1
color: rgba(255,255,255,0.10)
pointer-events: none
user-select: none
```

**Content** (z-index: 1, padding-right: 80 to clear watermark):
- **Rank label row** (10px caps, color `redInk`, weight 800, letter-spacing 0.24em, gap 8, flex-wrap): `PRIORITY` + italic `№ 1` (12px) + `·` + `{context}` (e.g., `4d waiting`, `11d silent`). Bottom margin: 6.
- **Top meta row** (12px, color `rgba(255,255,255,0.86)`): `{school}` (white 700, letter-spacing -0.01em) + tier badge (white-on-translucent variant) + `·` + `{coach}`.
- **Hero text** (italic 700, `clamp(26px, 2.4vw, 32px)`, line-height 1.05, white): the action sentence. Examples: `Reply to Brandon Bowman.`, `Re-engage Bobby Clark.`. Top margin 12, bottom margin 12, `text-wrap: balance`.
- **Preview** (14px, `rgba(255,255,255,0.86)`, line-height 1.55, max-width 640): the email/touchpoint excerpt, 2-line clamp. Bottom margin 22.
- **Action row** (gap 18, flex-wrap):
  - Primary CTA: white pill, `red` text, 9×18 padding, 12px weight 800, with chevron-right icon
  - 1px × 14 vertical divider in `rgba(255,255,255,0.25)`
  - Ghost `Done` (12px white-soft 700)
  - Ghost `Snooze 7d` (12px white-soft 700)

#### Compact cards (ranks 2, 3) — IDENTICAL except for the numeral

```
background: white
border: 1px line
border-radius: 16
padding: 22 26
display: flex; gap: 22; align-items: flex-start
```

- **Left rail numeral**: italic 800 64px, `red`, opacity 0.85, width 56, text-align center, padding-top 2, line-height 0.85, letter-spacing -0.06em.
- **Right (flex 1):** same RankLabel / TopMeta / Hero / Preview / action-row structure as the hero, but in dark text:
  - Rank label: `inkLo` (no `PRIORITY` word, just italic `№ 2` + context)
  - Top meta: `ink` school name, default tier badge, `inkMid` for `· {coach}`
  - Hero text: `clamp(20px, 1.9vw, 26px)`, ink
  - Preview: 13px, `inkMid`, 1-line clamp, max-width 540
  - Primary CTA: red pill, white text
  - Divider: `line2`
  - Ghost buttons: `inkLo`

### 6.4 Tactical caught-up state

Replaces the 3-card stack when no tactical items are scored.

```
background: ink
color: white
border-radius: 16
padding: 40 32
position: relative; overflow: hidden
```

- Watermark `0` glyph, italic 800 280px, `rgba(255,255,255,0.06)`, absolute right -20 bottom -50.
- Kicker: `PRIORITY` 11px caps, color `rgba(255,255,255,0.55)`.
- Title row (italic 700 `clamp(40px, 4.4vw, 56px)`, white, line-height 0.98, gap 14, flex-wrap baseline):
  - `Caught up.`
  - Inline pill: tiny red checkmark (14×14 SVG, stroke `red`) + `All clear` in 14px non-italic 700 `red`.
- Body: `Nothing pressing right now. Strategic prompts and pipeline activity are still worth a look below.` — 14px `rgba(255,255,255,0.7)`, line-height 1.55, max-width 520, bottom margin 22.
- CTA: white pill, `ink` text, label `Scan pipeline` + chevron-right.

### 6.5 Strategic — re-skin `StrategicSection.tsx`

Section header: subtle variant — kicker `THINK` 11px caps in `inkMute` (top border 2px `inkMute`), italic title `This week.` 18px in `inkLo`.

**The 4 prompts already in production (`reel_coverage`, `rq_refresh`, `stale_tier_a`, `pipeline_shape`) drive this section. Do not invent new ones.** Render up to 3 visible at a time per existing logic.

Grid:
```
display: grid
grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))
gap: 14
```

Each card:
```
background: tealDeep
color: white
border-radius: 14
padding: 22 24
position: relative; overflow: hidden
```

- **Tag** (top-right absolute, 18×20 inset): 10px caps `rgba(255,255,255,0.65)`, weight 800, letter-spacing 0.32em. Renders the prompt's category label (e.g., `COVERAGE`, `ROSTER GAP`, `RHYTHM`).
- **Question**: italic 700, `clamp(19px, 1.5vw, 22px)`, line-height 1.15, white, padding-right 80 to clear tag, `text-wrap: balance`.
- **Summary**: 13px `rgba(255,255,255,0.78)`, line-height 1.55, bottom margin 4.
- **Action row** (gap 16):
  - Primary: white pill, `tealDeep` text, 8×18, 12px weight 800, with chevron-right
  - Ghost: `Skip this week` in `rgba(255,255,255,0.65)` 11px 700

The existing modal flow (e.g., `BatchReelModal.tsx`) and skip-for-week behavior are unchanged.

### 6.6 Recently handled — light pass on `HandledSection.tsx`

Kicker: `RECENTLY HANDLED` 10px caps in `inkMute`, weight 800, letter-spacing 0.24em, bottom margin 12.

Stack of rows, gap 8. Each row at **opacity 0.62**:
```
background: paper
border: 1px line
border-radius: 10
padding: 10 16
display: flex; align-items: center; gap: 12
```

- Small teal-deep check circle SVG (14×14, stroke 1.4, ring + check).
- Body line (12.5px, flex 1, min-width 0): `{school}` (650 ink) · `{coach}` (inkLo) · `{what}` (inkMute).
- `{when}` timestamp on right (11px inkMute weight 600).
- `Undo` button (white bg, 1px line border, `tealDeep` text, 4×10, radius 6, 11px weight 700).

**Done/Undo wires to existing actions in `ActionsPanel.tsx`. Do not reimplement the action flow.**

### 6.7 Pipeline Activity — NEW component `today/PipelineRail.tsx`

Right rail on desktop, full-width bottom section on mobile. Today only — does not appear on other pages.

**Data filter & sort:**
- Filter: active Tier A + Tier B schools only
- Sort: HOT → ACTIVE → WARMING → COLD, then by recency within group
- **Cap visible at 10 schools**

**Container:**
- Desktop: width 320, padding 24 28 24 8, left border 1px `line`
- Mobile: width 100%, padding clamp(28px,5vw,36px) clamp(20px,5vw,28px) 24, top border 1px `line`, background `paperDeep`

**Section header:** kicker `PIPELINE` + italic `Activity.`

**Rows card:**
```
background: white
border: 1px line
border-radius: 14
padding: 6 16
```

Rows are grouped by status. Each group starts with a mini section label (10px caps weight 800 letter-spacing 0.18em) in the status color:
- `HOT` → `red`
- `ACTIVE` → `tealDeep`
- `WARMING` → `goldText`
- `COLD` → `inkMute`

Subsequent groups have a 1px `line` top border + `marginTop: 4` separating them from the previous group. The first group's label has no top border, just `padding: 12 0 4`.

Each row inside a group:
```
display: flex; align-items: center; gap: 12
padding: 12 4
cursor: pointer
border-top: 1px line  (only between rows within a group, not the first row)
```

- 7×7 dot in status color (border-radius 99, flex-shrink 0)
- Middle (flex 1, min-width 0): inline row gap 8 — `{school}` (13.5px 650 ink, ellipsis-truncate, letter-spacing -0.01em) + tier badge
- Right: status label (10px caps 800, letter-spacing 0.5em, status color)

**No detail/sublabel line.**

**Footnote** (margin-top 14, text-align center, 11px `inkMute`): `Tier A · B only — view all in [Schools →]`. The link span is `tealDeep` weight 700.

**On click:** row navigates to `/schools/[id]`. (Schools detail itself is out of scope for this iteration's redesign; just wire navigation to the existing route.)

### 6.8 Mobile bottom nav

Fixed bottom bar, paper bg, top border `line`, padding 10 20 22, flex space-around.

5 items: Today · Schools · Campaigns · Library · Tools. Active item:
- Italic style, weight 700, color `ink`
- 22×3 red bar absolute -10 above the label

Inactive items: `inkLo`, weight 500, normal style.

---

## 7. State variations

| State | Tactical | Caught-up panel | Strategic | Handled | Pipeline |
|---|---|---|---|---|---|
| **Default** | 3 cards (rank 1 hero red, rank 2/3 paper) | hidden | up to 3 prompts | recent handled rows | grouped HOT→COLD, capped 10 |
| **Caught-up** | hidden | shown (ink panel + "All clear") | up to 3 prompts | full handled list | sorted to show ACTIVE > WARMING > COLD (HOT empty) |

State is derived from data — no toggle. `caughtUp = tactical.length === 0`.

---

## 8. Animations & transitions

Minimal — this is a working tool, not a marketing page.

- **Card hover:** 150ms ease, `box-shadow: 0 1px 0 rgba(0,0,0,0.02)` → `0 2px 8px rgba(0,0,0,0.04)`. No translate.
- **Pipeline row hover:** 100ms, background goes from transparent → `paper`.
- **Button hover:** 150ms, slight darken on the fill (`red` → `redDeep` on red CTAs, `tealDeep` → `#004F4B` on teal CTAs, `ink` → `#1F1F1F` on ink CTAs).
- **Done/Undo:** 200ms opacity fade on the row when handled (the row moves into Recently Handled at 0.62 opacity).
- **Caught-up transition:** when the last tactical item is resolved, fade-out the cards (200ms) then fade-in the caught-up panel (200ms). Optional polish, not required for v1.

No page-load animations. No staggered reveals.

---

## 9. What's invented vs. what's prescribed

### Invented for illustration only (do NOT ship)

- Specific copy in tactical preview text (the email excerpt for Brown / Penn / Dartmouth)
- Specific coach names and school names in the mockup data
- Specific strategic prompt copy beyond the 4 fixed prompts (see § 2.1)
- Specific pipeline schools and their detail strings
- Specific timestamps in Recently Handled

### Prescribed (ship as designed)

- All layout, color, typography, spacing, and component structure
- All token usage
- All section ordering and responsive behavior
- The unified red treatment for tactical (rank 1 hero, rank 2/3 paper)
- The teal treatment for strategic
- The ink treatment for caught-up
- The pipeline rail's grouping, sort, cap-at-10, and Tier A/B filter
- All state variations and their behavior

---

## 10. Implementation order

1. Masthead wiring in `TodayClient.tsx` (compute `active` and `week` metrics from existing data)
2. Rewrite `TacticalSection.tsx` (hero + 2 compact + caught-up panel)
3. Re-skin `StrategicSection.tsx` (teal cards, drive from existing 4 prompts)
4. Light pass on `HandledSection.tsx` (icon + opacity + Undo button)
5. New `today/PipelineRail.tsx` component + integrate as right rail in `TodayClient.tsx`
6. Mobile bottom nav verification (already exists in `AppNav.tsx`; just confirm active-state styling matches)

---

## 11. Out of scope

- School detail page redesign
- Schools list redesign
- Library redesign
- Campaigns
- Any data model or scoring engine changes
- Any new strategic prompt categories beyond the existing 4
