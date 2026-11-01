import { describe, expect, it, vi } from 'vitest';
import type * as Format from '@/core/format';
import { previewImport } from './transfer';

vi.mock('@/core/format', async (original) => ({
  ...(await original<typeof Format>()),
  parseFile: () => {
    throw new Error('something gave way');
  },
}));

describe('previewImport', () => {
  it('says a file could not be read when reading it throws, and never throws itself', () => {
    expect(previewImport('{}')).toEqual({
      fatal: "This file couldn't be read: something gave way",
      version: null,
      rows: [],
      errors: [],
      parsed: null,
    });
  });
});
