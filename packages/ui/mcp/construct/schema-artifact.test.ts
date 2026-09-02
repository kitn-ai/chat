import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { CONSTRUCT_SCHEMA_URL, ConstructSchema } from './schema';

// The checked-in artifact must equal what the Zod source produces RIGHT NOW.
// gen-construct-schema.mjs is the writer; this test is the reader-side pin so
// a schema edit without a regen goes red in the unit suite too, not only in
// verify:generated.
describe('construct.v1.schema.json', () => {
  it('matches z.toJSONSchema(ConstructSchema) exactly', () => {
    const artifact = JSON.parse(
      readFileSync(resolve(__dirname, 'construct.v1.schema.json'), 'utf8'),
    );
    expect(artifact).toEqual({
      $id: CONSTRUCT_SCHEMA_URL,
      ...(z.toJSONSchema(ConstructSchema) as Record<string, unknown>),
    });
  });

  it('docs-site copy is byte-identical (same artifact, second address)', () => {
    const a = readFileSync(resolve(__dirname, 'construct.v1.schema.json'), 'utf8');
    const b = readFileSync(
      resolve(__dirname, '../../../../apps/docs/public/schemas/construct/v1.json'),
      'utf8',
    );
    expect(b).toBe(a);
  });
});
