import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EarPage } from '@/features/ear/EarPage';
import { HomePage } from '@/features/home/HomePage';
import { ProgressionBuilderPage } from '@/features/progressions/ProgressionBuilderPage';
import { SongsPage } from '@/features/song/SongsPage';
import { KeyboardDock } from '@/ui/keyboard/KeyboardDock';
import { armAudio, audio } from './services';

/** The context the engine reports, as far as arming cares. */
let ctx: { state: AudioContextState } | null = null;
let unlock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  ctx = null;
  unlock = vi.spyOn(audio, 'unlock').mockImplementation(() => {
    ctx ??= { state: 'suspended' };
    return Promise.resolve();
  });
  vi.spyOn(audio, 'context').mockImplementation(() => ctx as AudioContext | null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const gesture = (type: string) => window.dispatchEvent(new Event(type));

describe('armAudio', () => {
  it('does nothing until a room arms it', () => {
    gesture('pointerup');
    gesture('keydown');
    expect(unlock).not.toHaveBeenCalled();
  });

  it('unlocks on the gestures that can start audio, not on a touch going down', () => {
    const done = armAudio();
    gesture('pointerdown');
    expect(unlock).not.toHaveBeenCalled();
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) gesture(type);
    expect(unlock).toHaveBeenCalledTimes(4);
    done();
  });

  it('keeps listening until the context is running, then lets go', () => {
    const done = armAudio();
    gesture('pointerup');
    gesture('pointerup');
    expect(unlock).toHaveBeenCalledTimes(2);
    ctx = { state: 'running' };
    gesture('pointerup');
    gesture('pointerup');
    expect(unlock).toHaveBeenCalledTimes(3);
    done();
  });

  it('stays armed until the last room that armed it closes', () => {
    const first = armAudio();
    const second = armAudio();
    first();
    first();
    gesture('click');
    expect(unlock).toHaveBeenCalledTimes(1);
    second();
    gesture('click');
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('does not arm once audio is running', () => {
    ctx = { state: 'running' };
    const done = armAudio();
    gesture('pointerup');
    expect(unlock).not.toHaveBeenCalled();
    done();
  });
});

describe('the rooms that play arm it; the others do not', () => {
  const inRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

  it.each([
    ['Home', <HomePage key="home" />],
    ['Songs', <SongsPage key="songs" />],
  ])('%s does not', (_name, ui) => {
    inRouter(ui);
    gesture('pointerup');
    expect(unlock).not.toHaveBeenCalled();
  });

  it.each([
    ['a keyboard', <KeyboardDock key="dock" />],
    ['Ear training', <EarPage key="ear" />],
    ['the progression builder', <ProgressionBuilderPage key="builder" />],
  ])('%s does', (_name, ui) => {
    const { unmount } = inRouter(ui);
    gesture('pointerup');
    expect(unlock).toHaveBeenCalledTimes(1);
    unmount();
    gesture('pointerup');
    expect(unlock).toHaveBeenCalledTimes(1);
  });
});
