## Goal
Drop the separate **Hierarchy** column. Merge campaign / ad set / ad names into the **Company** column so everything stacks under the client name, recovering horizontal space and matching the "Dan Nguyen | 3 Campaigns" pattern.

## What changes (all in `src/components/dashboard/ClientHierarchyTable.tsx`)

### 1. Client row — Company cell
Today the company cell shows just the client name. Change it to show name + a quiet meta line:

```
Dan Nguyen
3 campaigns · 12 ads
```

- Name stays as the primary line (same size/weight).
- Meta line: `text-[11px] text-muted-foreground`, computed from `clientCampaigns.length` and the sum of `adsByCampaign.get(camp.id).length` for that client. Hidden when the row is collapsed-empty or zero.

### 2. Nested rows — move name INTO the Company column
- Campaign / Ad set / Ad rows render their badge + icon + name inside the existing Company `<td>` (instead of the Hierarchy `<td>`).
- The Hierarchy `<td>` is removed from those rows.
- Keep the level badge (`CAMP` / `ADSET` / `AD`) and icon chip — they're the only visual cue for depth now.
- Keep the subtle row tinting (`bg-muted/10` → `/30` → `/50`).

### 3. Remove the Hierarchy column entirely
- Delete the `<th>Hierarchy</th>` from the header row.
- Delete the Hierarchy `<td>` from the client, campaign, ad set, and ad rows.
- Drop the `LEVEL_STYLES.client` chip / `LevelBadge level="client"` usage in the client row (the client name itself is the identifier now).
- Drop the leftover rail/`pl-14`/`pl-20` indent code — no longer needed.

### 4. Column header guard
`showCompanyCol` (currently the toggle for the Company column) becomes effectively always-on whenever the table is multi-client; force it true so we don't end up with no name column. When a single client is focused, keep the column visible but skip the redundant client-name line on nested rows (they already belong to the focused client).

## Visual result

```text
Status  Company                              Spend   Leads   CPL …
─────────────────────────────────────────────────────────────────
●       Dan Nguyen                           $4,210   142    $29
        3 campaigns · 12 ads
   ▾    CAMP   Spring Promo                  $1,800    61    $29
      ▾ ADSET  Lookalike 1%                    $900    33    $27
        AD     Hero video v3                   $300    11    $27
```

## Technical notes
- One file: `src/components/dashboard/ClientHierarchyTable.tsx`.
- Header: remove the Hierarchy `<th>`; keep all metric `<th>`s.
- Client row: append `<p className="text-[11px] text-muted-foreground">{n} campaigns · {m} ads</p>` under the existing name `<p>`. Compute `n`/`m` from `campaignsByClient.get(String(client.id))` and `adsByCampaign`.
- Campaign / Ad set / Ad rows: move the existing `<div className="flex items-center gap-2">…LevelBadge + icon + name…</div>` block into the Company `<td>`; delete the old Hierarchy `<td>`.
- Drop the now-unused empty `<td className="px-2 py-2"></td>` placeholders on nested rows.
- No data, hook, or business-logic changes.
