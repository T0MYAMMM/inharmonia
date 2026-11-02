import { describe, expect, it } from 'vitest';
import { roomOf } from './rooms';

describe('roomOf', () => {
  it('knows each room by its first segment', () => {
    expect(roomOf('/fills/step-up')).toEqual({ room: 'fills', index: false, wash: false });
    expect(roomOf('/songs/charts/new').room).toBe('songs');
    expect(roomOf('/studio/edit/abc').room).toBe('studio');
  });

  it('washes the index pages whose content is cards', () => {
    for (const path of ['/songs', '/progressions', '/fills', '/studio', '/progress/'])
      expect(roomOf(path), path).toMatchObject({ index: true, wash: true });
  });

  it('gives Chords and Ear training their line but no wash', () => {
    expect(roomOf('/chords')).toEqual({ room: 'chords', index: true, wash: false });
    expect(roomOf('/ear')).toEqual({ room: 'ear', index: true, wash: false });
  });

  it('leaves Home and the pages outside the rooms alone', () => {
    for (const path of ['/', '', '/about', '/keyboard', '/no-such-page', '/progressive'])
      expect(roomOf(path), path).toEqual({ room: null, index: false, wash: false });
  });
});
