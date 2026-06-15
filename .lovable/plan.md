# Plan — Fix empty rollups + Customizable columns

## Problem 1 — Client rows show "—" while campaigns have data

Client rows on the Dashboard read from the snapshot fields on `clients` (`cpl`, `cpm`, `leads`, `spend`, `frequency`, `form_cvr`). For some clients the snapshot was never recomputed after the recent sync, so campaign‑level insights exist in `meta_insights_granular_daily` but the parent row still shows "—".

**Fix (two layers, applied together)**

1. **Live rollup in the UI (instant)** — `ClientTable` (Dashboard) and `ClientHierarchyTable` will compute CPL/CPM/Spend/Leads/Freq/Above‑640 the same way `ClientProfile` already does: aggregate **active** campaigns from `useClientsRangeMetrics` for the selected date range, fall back to snapshot only when no range data exists. This removes the "—" without waiting for any backend job.
2. **Snapshot refresh button (durable)** — Add a small "Refresh snapshot" item inside the existing "Sync All Accounts" action in Quick Actions, and a per‑row "Recompute" option in the row menu. Both call a new edge function `client-snapshot-recompute` that:
   - Sums last‑30‑day insights from `meta_insights_granular_daily` per client (active campaigns only).
   - Updates `clients.cpl/cpm/spend/leads/frequency`.
   - Returns a summary toast.

## Problem 2 — Customizable columns (Both tables, per user, built‑in + custom KPIs + ad‑hoc formula)

### New DB

```sql
create table public.user_table_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  table_key text not null,            -- 'clients' | 'client_campaigns'
  columns jsonb not null default '[]',-- ordered array of column configs
  updated_at timestamptz default now(),
  unique (user_id, workspace_id, table_key)
);
-- + GRANTs, RLS (own row only), updated_at trigger
```

Column config shape:
```json
{ "id": "cpl", "kind": "builtin" }
{ "id": "kpi_abc", "kind": "custom_kpi", "kpi_id": "uuid" }
{ "id": "f_1", "kind": "formula", "label": "Adj CPL", "expr": "spend/leads*1.2", "format": "currency" }
```

### New components

- `src/components/common/ColumnPicker.tsx` — popover with three tabs:
  - **Built‑in**: checkbox list of available KPIs for this table.
  - **Custom KPIs**: pulled from existing `custom_kpis` table.
  - **Formula**: label + expression input, format dropdown (number/currency/percent). Reuses `src/lib/kpiFormula.ts` to validate.
- `src/hooks/useTableColumns.ts` — load/save/reorder columns in `user_table_views`, optimistic cache.
- `src/lib/columnRenderers.ts` — given a row + column config, return formatted value; resolves built‑ins from row fields, custom KPIs from `custom_kpi_evaluations`, formulas via `evaluateKpiFormula(expr, row)`.

### Wiring

- `ClientTable` (Dashboard): render fixed columns (Status, Company) + dynamic columns from hook. "+ Columns" button opens picker.
- Campaigns table inside `ClientProfile` (rows for Campaign/Ad set/Ad): same picker, separate `table_key='client_campaigns'`. Built‑ins offered: Impressions, Clicks, CTR, Spend, Leads, CPL, True CPL, CPM, Freq, Above 640, Below 640, Quality %, Reach.

### Sheet polish

- Sticky first two columns (Status, Company / Status, Name).
- Right‑align numeric columns, monospace tabular numbers.
- Compact density toggle (rows of 32px) — saved alongside column prefs.
- Drag‑to‑reorder column chips in the picker.
- Empty‑cell shows "—" only when **both** range data AND snapshot are zero; otherwise show the value (kills most of the false "—").

## Out of scope (not changing)

- Date range picker behavior, KPI threshold colors, Custom KPI definitions UI (already exists at `/settings`).

## Technical details

- New edge function: `supabase/functions/client-snapshot-recompute/index.ts` — accepts `{ workspaceId, clientId? }`, runs the rollup SQL with the service role, updates `clients`.
- New migration: `user_table_views` + GRANTs + RLS policies (`auth.uid() = user_id`).
- Reuse: `src/lib/kpiFormula.ts` (formula eval), `useCustomKpis`, `useClientsRangeMetrics`, `useClientCampaignsRange`.
- TanStack Query keys: `["user-table-view", table_key]`, invalidated on save.
- No changes to Supabase auto‑gen files.

## Files touched

- New: `supabase/migrations/<ts>_user_table_views.sql`, `supabase/functions/client-snapshot-recompute/index.ts`, `src/components/common/ColumnPicker.tsx`, `src/hooks/useTableColumns.ts`, `src/lib/columnRenderers.ts`.
- Edit: `src/components/dashboard/ClientTable.tsx`, `src/components/dashboard/ClientHierarchyTable.tsx`, `src/components/dashboard/QuickActionBar.tsx`, `src/pages/ClientProfile.tsx` (campaigns table section).
