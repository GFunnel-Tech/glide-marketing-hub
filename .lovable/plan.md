## Goal

A dedicated Tasks & Notes section where users can bookmark future actions. On the due date, items automatically appear in Today's task surfaces (Daily Focus widget on the dashboard + a new "Today" tasks panel). Available globally and per-client.

## Data model

Extend the existing `client_notes` table (already has `due_at`, `assigned_to`, `done`, `reminded_at`, `client_id`, `workspace_id`, `user_id`). Add:

- `title TEXT` — short headline (existing `content` becomes the body/notes)
- `kind TEXT NOT NULL DEFAULT 'note'` — `'note' | 'task'` (tasks have scheduling/assignee; notes are free-form)
- `recurrence JSONB` — `{ freq: 'daily'|'weekly'|'monthly', interval: int, byweekday?: int[], end_at?: timestamptz }`, NULL = one-off
- `next_due_at TIMESTAMPTZ` — for recurring tasks, the next scheduled occurrence (drives Today queries)
- `completed_at TIMESTAMPTZ`
- `priority TEXT` — `'low'|'normal'|'high'`

Server trigger on UPDATE: when a recurring task is marked `done`, compute the next occurrence into `next_due_at` and reset `done=false`, `reminded_at=NULL`. One-off tasks just stay `done`.

Reuse `fire_due_client_notes()` (already wired to in-app notifications) for the "Reminder/notification" requirement — it already notifies creator + assignee when `due_at <= now()`.

## UI

### 1. Global Tasks page (`/tasks`)
- New top-nav entry "Tasks".
- Tabs: **Today**, **Upcoming**, **Overdue**, **Notes**, **Completed**.
- Each row: checkbox, title, client chip (linked), assignee avatar, due date/time, recurrence badge, priority dot.
- Inline quick-add: title + due date + optional client + assignee.
- Filters: assignee (me/all), client, priority.

### 2. Per-client Tasks/Notes tab (Client Profile)
- New "Tasks & Notes" tab inside `ClientProfile`.
- Same row component, scoped to that client; quick-add pre-fills `client_id`.

### 3. Dashboard "Today" surfaces
- **Daily Focus widget** (existing): inject due tasks (where `(next_due_at ?? due_at)::date <= today AND done=false`) alongside current focus items, sorted by overdue → today → priority.
- **New "Today's Tasks" panel** on the dashboard: dedicated card listing today's + overdue tasks with quick complete/snooze actions. Sits beside Daily Focus.

### 4. Components
- `src/pages/Tasks.tsx` — global page
- `src/components/tasks/TaskList.tsx` — shared list (used by global page, client tab, dashboard panel)
- `src/components/tasks/TaskRow.tsx` — row with checkbox, recurrence/priority badges, snooze menu
- `src/components/tasks/TaskQuickAdd.tsx` — title + due + assignee + client + recurrence popover
- `src/components/tasks/TaskEditDialog.tsx` — full edit (title, notes/markdown, due date+time, assignee, client/campaign link, priority, recurrence)
- `src/components/dashboard/TodaysTasksPanel.tsx` — dashboard card
- `src/components/clients/ClientTasksTab.tsx` — per-client tab
- Hooks in `src/hooks/useTasks.ts` with snake_case→camelCase adapter and TanStack Query + Supabase Realtime subscription on `client_notes`.

### 5. Daily Focus integration
- Update the daily focus data source to UNION due tasks from `client_notes` so they show in the existing widget without duplicating UI.

## Migration outline

```sql
ALTER TABLE public.client_notes
  ADD COLUMN title TEXT,
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'note',
  ADD COLUMN recurrence JSONB,
  ADD COLUMN next_due_at TIMESTAMPTZ,
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';

CREATE INDEX client_notes_due_idx
  ON public.client_notes (workspace_id, COALESCE(next_due_at, due_at))
  WHERE done = false;

-- Trigger: on complete, advance recurrence
CREATE OR REPLACE FUNCTION public.advance_recurring_task() ...;
CREATE TRIGGER trg_advance_recurring_task
  BEFORE UPDATE ON public.client_notes
  FOR EACH ROW WHEN (NEW.done = true AND OLD.done = false)
  EXECUTE FUNCTION public.advance_recurring_task();
```

Existing RLS on `client_notes` already scopes by workspace/user — no policy changes needed. `fire_due_client_notes()` already covers reminders; update it to also use `COALESCE(next_due_at, due_at)`.

## Out of scope

- Calendar grid view (list views only for v1)
- Sub-tasks / checklists
- Email/SMS reminders (in-app notifications only — already wired)
- Drag-to-reschedule (use edit dialog)
