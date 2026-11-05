/**
 * Docker-free stand-in for a local Supabase database.
 *
 * Boots PGlite (Postgres compiled to WASM), recreates the minimal parts of
 * Supabase that our migrations rely on (roles, `auth.users`, `auth.uid()`,
 * the `supabase_realtime` publication) and applies all migrations + seed.
 *
 * This is for fast feedback only. CI also runs the same pgTAP files against
 * a real Supabase stack with `supabase test db`, which is authoritative.
 */
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgtap } from '@electric-sql/pglite-pgtap';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPABASE_DIR = resolve(fileURLToPath(import.meta.url), '../../../supabase');

const SUPABASE_STUB = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema extensions;
  create schema auth;
  grant usage on schema public, extensions, auth to anon, authenticated, service_role;

  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(
      current_setting('request.jwt.claim.sub', true),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create publication supabase_realtime;
  set search_path = public, extensions;
`;

export function sqlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

export async function createDatabase({ seed = true } = {}): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { btree_gist, pgtap } });
  await db.exec(SUPABASE_STUB);

  for (const file of sqlFiles(join(SUPABASE_DIR, 'migrations'))) {
    try {
      await db.exec(readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`Migration failed: ${file}\n${(error as Error).message}`);
    }
  }
  const seedFile = join(SUPABASE_DIR, 'seed.sql');
  if (seed && existsSync(seedFile)) await db.exec(readFileSync(seedFile, 'utf8'));
  return db;
}

export interface TapResult {
  planned: number;
  passed: number;
  failures: string[];
  output: string;
}

/** Runs a pgTAP file (which manages its own transaction) and parses the TAP output. */
export async function runPgTapFile(db: PGlite, file: string): Promise<TapResult> {
  const results = await db.exec(readFileSync(file, 'utf8'));
  const lines = results
    .flatMap((r) => r.rows.flatMap((row) => Object.values(row)))
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => v.split('\n'));

  const plan = lines.find((l) => /^1\.\.\d+$/.test(l));
  const failures: string[] = [];
  lines.forEach((line, i) => {
    if (!line.startsWith('not ok')) return;
    const diagnostics = lines.slice(i + 1).filter((l, j, rest) => l.startsWith('#') && rest.slice(0, j).every((p) => p.startsWith('#')));
    failures.push([line, ...diagnostics].join('\n'));
  });

  return {
    planned: plan ? Number(plan.slice(3)) : 0,
    passed: lines.filter((l) => /^ok \d+/.test(l)).length,
    failures,
    output: lines.join('\n'),
  };
}
