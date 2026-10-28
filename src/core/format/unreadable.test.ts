import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type * as Draft from '../songs/draft';
import { PATTERNS } from '@/content/patterns';
import { describeError, parseFile } from '.';

// Something deeper than the file's own checks fails with a plain Error.
vi.mock('../songs/draft', async (original) => ({
  ...(await original<typeof Draft>()),
  toLesson: () => {
    throw new Error('the score could not be built');
  },
}));

describe('an item that throws while it is read', () => {
  it('is reported with its item, not thrown, so the preview can say it', () => {
    const text = readFileSync(
      resolve(__dirname, '../../../docs/format/examples/midi-song.json'),
      'utf8',
    );
    const p = parseFile(text, {
      patterns: new Set(Object.keys(PATTERNS)),
      fallbackPattern: 'block',
    });
    if ('fatal' in p) throw new Error(p.fatal);
    expect(p.items).toEqual([]);
    expect(p.errors.map(describeError)).toEqual([
      "Item 1 (Example MIDI song): couldn't be read: the score could not be built",
    ]);
  });
});
