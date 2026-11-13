import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, SUPABASE_DIR } from './supabase-lite.js';

describe('seed data', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('creates the demo building with 1 washer and 1 dryer', async () => {
    const { rows } = await db.query<{ join_code: string; washers: number; dryers: number }>(`
      select b.join_code,
             count(*) filter (where m.type = 'washer')::int as washers,
             count(*) filter (where m.type = 'dryer')::int as dryers
      from public.buildings b join public.machines m on m.building_id = b.id
      group by b.join_code`);
    expect(rows).toEqual([{ join_code: 'DEMO2026', washers: 1, dryers: 1 }]);
  });

  it('can be applied twice without errors', async () => {
    await expect(db.exec(readFileSync(join(SUPABASE_DIR, 'seed.sql'), 'utf8'))).resolves.toBeDefined();
  });
});
