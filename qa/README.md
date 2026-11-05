# WashSlot QA tooling

Database & QA test tooling. Requires Node 22+.

```bash
cd qa
npm ci
npm test          # pgTAP database tests on PGlite (no Docker needed)
npm run typecheck # TypeScript
```

## Database tests

pgTAP tests live in [`../supabase/tests/database`](../supabase/tests/database). They run in two ways:

| Runner | Command | Needs | Used for |
| --- | --- | --- | --- |
| PGlite + Vitest | `npm test` (in `qa/`) | Node only | Fast local feedback |
| Real Supabase | `supabase start && supabase test db` (repo root) | Docker | CI, source of truth |

The PGlite runner recreates only the Supabase pieces our migrations use (`anon`/`authenticated`/`service_role`
roles, `auth.users`, `auth.uid()`, the `supabase_realtime` publication), see [`db/supabase-lite.ts`](db/supabase-lite.ts).
If a test passes here but fails in CI, CI wins.

### Writing a test

Each file starts a transaction, sets a `plan(n)`, creates its own fixtures and rolls back:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
-- act as a signed-in user:
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user uuid>","role":"authenticated"}';
select ok(true, 'description');
reset role;
select * from finish();
rollback;
```

## Commit messages

[Angular convention](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit), checked in CI:

```
<type>(<scope>): <subject>     # type: build|ci|docs|feat|fix|perf|refactor|style|test

Closes #<issue>
```

Check locally: `echo "feat(db): add bookings" | npx commitlint --config qa/commitlint.config.mjs`
