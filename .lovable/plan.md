## Goal
Make it instantly clear what level each row in the hierarchy table represents — Client, Campaign, Ad set, or Ad — without forcing the eye to count indents.

## What changes

### 1. Level badge on every row
Add a small colored chip in the name cell, immediately before the row label:

- `CLIENT` — slate / neutral chip
- `CAMP` — blue chip
- `ADSET` — amber chip
- `AD` — pink chip

Compact (10–11px uppercase, monospace tracking-wider), so it reads like a tag, not a button. Same color family already used for icon chips elsewhere in the dashboard.

### 2. Indent rails (vertical guide lines)
Replace the current flat left-padding with thin vertical rails on the left edge of each nested row:

```text
│       Client row                 (no rail)
│ │     Campaign row               (1 rail)
│ │ │   Ad set row                 (2 rails)
│ │ │ │ Ad row                     (3 rails)
```

Rails are 1px, `border-border/60`, and align to the indent so the parent/child relationship is visible at a glance even when scrolled.

### 3. Header column rename
Change the column header from `Campaign / Ad set / Ad` to `Hierarchy` (single word, fits on one line, doesn't lie about the contents now that Client rows also live there).

### 4. Row background tinting (subtle)
- Client rows: keep current card-like background
- Campaign rows: `bg-muted/20`
- Ad set rows: `bg-muted/40`
- Ad rows: `bg-muted/60`

Progressive shading reinforces the hierarchy the same way the rails do, but works for users who scroll the body away from the header.

### 5. Sticky "you are viewing" breadcrumb (only when a row is expanded deep)
When the user has scrolled past the parent row, show a tiny sticky breadcrumb above the table body:

`Acme Co  ›  Spring Promo  ›  Lookalike 1%`

Updates based on the deepest currently-visible expanded chain. Hidden when nothing is expanded or when the parent is still on screen.

## Technical notes
- All changes are in `src/components/dashboard/ClientHierarchyTable.tsx`.
- Badge component: small inline `<span>` with the existing tinted-chip classes (`bg-blue-500/10 text-blue-600` etc., mapped to semantic tokens).
- Rails: a flex container of N `<div className="w-px self-stretch bg-border/60" />` elements before the label, where N is the depth.
- Sticky breadcrumb: a single `<tr>` with `position: sticky; top: 2.25rem` sitting just under the header. Computed from `openClients` / `openCampaigns` / `openAdSets` plus the IntersectionObserver of the parent row (or simpler: just always show the deepest open chain when any campaign-or-deeper row is open).
- No business logic changes, no data changes.
