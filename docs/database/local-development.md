# Local Supabase

The whole backend (Postgres 17, Auth, Realtime, Studio) runs locally from `supabase/config.toml`.
No Supabase account is needed for local development.

## One-time setup (Windows)

1. **WSL2** – in an *administrator* PowerShell: `wsl --install`, then reboot.
2. **Docker Desktop** – `winget install Docker.DockerDesktop`, start it and wait until it says *Engine running*.
3. **Node 22+** – the Supabase CLI is run through `npx`, nothing else to install.

macOS / Linux: install Docker (Desktop, OrbStack or Docker Engine) and Node 22+.

## Daily use (from the repo root)

| Task | Command |
| --- | --- |
| Start everything | `npx supabase start` |
| Show URLs and keys | `npx supabase status` |
| Reset DB (re-run migrations + seed) | `npx supabase db reset` |
| Run database tests | `npx supabase test db` |
| Create a new migration | `npx supabase migration new <name>` |
| Stop | `npx supabase stop` |

After `supabase start`:

- API: `http://127.0.0.1:54321`, Studio: `http://127.0.0.1:54323`, Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Emails (sign-up confirmations) are caught by Mailpit: `http://127.0.0.1:54324`
- Seed data: building **Demo Dormitory** with 5 washers and 5 dryers. Sign up, then join with code **`DEMO2026`**.

Frontend `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from `npx supabase status`>
```

## Without Docker

`cd qa && npm ci && npm test` runs all database tests on PGlite. See [qa/README.md](../../qa/README.md).

## Changing the schema

1. Open an issue, branch `feat/<issue>-<name>` from `main`.
2. `npx supabase migration new <name>` and write SQL (never edit a migration that is already on `main`).
3. Add/extend pgTAP tests in `supabase/tests/database`.
4. `npx supabase db reset && npx supabase test db` (or `npm test` in `qa/`).
5. Open a PR; CI must be green before merge.
