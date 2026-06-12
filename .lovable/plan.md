# Improve Account Mapping UX

The current mapper in `src/components/integrations/ClientAccountMapper.tsx` mixes "selecting" and "linking" into the same click, so changing a mapping requires multiple `window.confirm` dialogs and unmapping requires selecting the client first. This refactor separates the two and adds direct unmap/remap controls.

## Changes

### 1. Sticky selection / action bar (top of the panel)
Replace the cascaded native confirms with one always-visible bar that shows the three current picks and one clear action button.

```text
[ GHL: Open House Finance  × ] [ Meta: act_123 · OHF  × ] [ Client: Joseph Bui  × ]   [ Link selected ]
```

- Each chip has its own × to clear that pick.
- The action button intelligently labels itself:
  - "Link selected" when picks are unmapped or mapped elsewhere.
  - "Already linked" (disabled) when the picks already match.
  - "Replace mapping" with an inline warning sub-line when something would be overwritten ("GHL is currently linked to Client X — this will move it").
- All "are you sure" prompts move from `window.confirm` into this bar, so the user sees full context before clicking.

### 2. Click = select only (no side effects)
Row clicks in any of the three columns just toggle selection. Linking only happens via the action bar. This fixes the "clicked a row and it linked something I didn't mean to" problem.

### 3. Inline unlink on every mapped row
Each row that already shows a linked badge gets a small hover-revealed "Unlink" icon button next to the badge. One click unmaps that single row without needing to select anything else — the most common cleanup action becomes a one-click operation.

### 4. Inline "Change" on conflicting picks
When you've selected a client and a Meta row that belongs to a different client, the Meta row shows an amber "→ move to <selected client>" hint instead of firing a confirm. Pressing the action bar's "Replace mapping" performs the move.

### 5. Smaller cleanup
- Remove the now-unused `Slot` component (already orphaned).
- Keep auto-select-by-name behavior, but only when no client is currently selected, so the user can override it.
- Keep the "Create client from selection" row in the Clients column as-is.

## Technical notes

- All changes are local to `src/components/integrations/ClientAccountMapper.tsx`. No schema, query, or backend changes.
- Existing mutations (`linkMetaToClient`, `linkGhlToClient`, `createClient`) stay; only the call sites change.
- No new dependencies. Inline confirmations use existing shadcn primitives (`Button`, `Badge`, `Tooltip` already in the project).
- `toast` continues to confirm completion; no native `confirm()` dialogs remain.

## Out of scope

- No changes to the auto-match suggestion queue, the per-client integrations tab, or the advanced bulk mapper.
- No data migration or RLS changes.
