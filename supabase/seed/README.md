# Seeds

## `demo_account.sql` — Demo Account

Creates a self-contained **Demo Account** workspace populated with fake data so
the app looks alive for demos:

- 1 workspace (`Demo Account`, slug `demo-account`)
- 5 fake client accounts (dental, law, fitness, ortho, roofing)
- 9 campaigns
- 25 leads across every channel — Meta, Google, TikTok, LinkedIn, manual
- lead scores (A–D grades) for the scored channels

The script is **idempotent**: re-running it wipes and recreates only the demo
workspace's data and never touches real workspaces.

### Run it

1. Open the **Supabase Dashboard → SQL Editor** for the project the app uses
   (`kkuvdoejqruszisyojap`, per `.env`).
2. Open `demo_account.sql`, change `v_demo_email` at the top if needed
   (defaults to `admin@gfunnel.com`), and paste + **Run**.

> The owning account (`v_demo_email`) must already exist in `auth.users` — i.e.
> sign that user up once before running. The demo workspace then appears in the
> workspace switcher under that account.

Or from a shell with the DB connection string:

```bash
psql "$DATABASE_URL" -f supabase/seed/demo_account.sql
```
