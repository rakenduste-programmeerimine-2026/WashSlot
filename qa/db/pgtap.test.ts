import type { PGlite } from '@electric-sql/pglite';
import { basename, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runPgTapFile, sqlFiles, SUPABASE_DIR } from './supabase-lite.js';

const testFiles = sqlFiles(join(SUPABASE_DIR, 'tests', 'database'));

describe('database (pgTAP on PGlite)', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('boots with all migrations applied', async () => {
    const { rows } = await db.query<{ ok: number }>('select 1 as ok');
    expect(rows[0]?.ok).toBe(1);
  });

  it.skipIf(testFiles.length === 0).each(testFiles.map((f) => [basename(f), f]))('%s', async (_name, file) => {
    const result = await runPgTapFile(db, file);
    expect(result.failures, result.output).toEqual([]);
    expect(result.planned, 'pgTAP plan() missing').toBeGreaterThan(0);
    expect(result.passed).toBe(result.planned);
  });
});
