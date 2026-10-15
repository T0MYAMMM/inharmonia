import { describe, expect, it, vi } from 'vitest';
import { ComputerKeys } from './computerKeys';
import { NoteStream, type NoteInputEvent } from './noteStream';
import { bindPointerInput } from './pointer';
import { parseMidiMessage, WebMidiInput } from './webMidi';

function collect(stream: NoteStream) {
  const events: NoteInputEvent[] = [];
  stream.subscribe((e) => events.push(e));
  return events;
}

const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent(type, { code, cancelable: true, ...init });

describe('NoteStream', () => {
  it('tracks held notes across sources', () => {
    const s = new NoteStream();
    const ev = collect(s);
    s.noteOn(60, 0.8, 'keys');
    s.noteOn(60, 0.8, 'midi');
    s.noteOn(64, 0.8, 'pointer');
    expect(s.held()).toEqual([60, 64]);
    s.noteOff(60, 'keys');
    expect(s.isHeld(60)).toBe(true);
    s.noteOff(60, 'midi');
    expect(s.isHeld(60)).toBe(false);
    expect(ev.map((e) => `${e.type}${e.midi}`)).toEqual(['on60', 'on64', 'off60']);
  });

  it('releases all notes of one source', () => {
    const s = new NoteStream();
    s.noteOn(60, 1, 'keys');
    s.noteOn(62, 1, 'midi');
    s.releaseAll('keys');
    expect(s.held()).toEqual([62]);
    s.releaseAll();
    expect(s.held()).toEqual([]);
  });

  it('ignores a release that was never pressed', () => {
    const s = new NoteStream();
    const ev = collect(s);
    s.noteOff(60, 'keys');
    expect(ev).toHaveLength(0);
  });
});

describe('ComputerKeys', () => {
  it('maps the prototype layout from C4', () => {
    const s = new NoteStream();
    const k = new ComputerKeys(s);
    expect(k.midiFor('KeyA')).toBe(60);
    expect(k.midiFor('KeyW')).toBe(61);
    expect(k.midiFor('KeyH')).toBe(69);
    expect(k.midiFor('KeyL')).toBe(74);
    expect(k.midiFor('Semicolon')).toBe(76);
    expect(k.midiFor('Quote')).toBe(77);
    expect(k.midiFor('KeyQ')).toBeNull();
  });

  it('plays, ignores repeats, and shifts octaves with Z and X', () => {
    const s = new NoteStream();
    const ev = collect(s);
    const onShift = vi.fn();
    const k = new ComputerKeys(s, { onShift });
    k.handleKeyDown(key('keydown', 'KeyA'));
    k.handleKeyDown(key('keydown', 'KeyA', { repeat: true }));
    k.handleKeyUp(key('keyup', 'KeyA'));
    k.handleKeyDown(key('keydown', 'KeyZ'));
    k.handleKeyDown(key('keydown', 'KeyA'));
    expect(onShift).toHaveBeenCalledWith(-1);
    expect(ev.map((e) => `${e.type}${e.midi}`)).toEqual(['on60', 'off60', 'on48']);
  });

  it('releases the note it started even if the octave changed while held', () => {
    const s = new NoteStream();
    const k = new ComputerKeys(s);
    k.handleKeyDown(key('keydown', 'KeyA'));
    k.handleKeyDown(key('keydown', 'KeyX'));
    k.handleKeyUp(key('keyup', 'KeyA'));
    expect(s.held()).toEqual([]);
  });

  it('clamps the octave shift', () => {
    const k = new ComputerKeys(new NoteStream(), { minShift: -1, maxShift: 1 });
    for (let i = 0; i < 5; i++) k.handleKeyDown(key('keydown', 'KeyX'));
    expect(k.octaveShift).toBe(1);
  });

  it('ignores typing in text fields and modifier shortcuts', () => {
    const s = new NoteStream();
    const k = new ComputerKeys(s);
    const input = document.createElement('input');
    document.body.append(input);
    const e = key('keydown', 'KeyA', { bubbles: true });
    Object.defineProperty(e, 'target', { value: input });
    expect(k.handleKeyDown(e)).toBe(false);
    expect(k.handleKeyDown(key('keydown', 'KeyA', { ctrlKey: true }))).toBe(false);
    expect(s.held()).toEqual([]);
    input.remove();
  });

  it('releases held keys on blur', () => {
    const s = new NoteStream();
    const k = new ComputerKeys(s);
    const detach = k.attach(window);
    window.dispatchEvent(key('keydown', 'KeyA'));
    window.dispatchEvent(key('keydown', 'KeyD'));
    expect(s.held()).toEqual([60, 64]);
    window.dispatchEvent(new Event('blur'));
    expect(s.held()).toEqual([]);
    detach();
  });
});

describe('pointer input', () => {
  it('plays the pressed key and releases on pointerup', () => {
    const s = new NoteStream();
    const root = document.createElement('div');
    root.innerHTML = '<button data-midi="60">C</button><button data-midi="62">D</button>';
    document.body.append(root);
    const detach = bindPointerInput(root, s);
    const c = root.querySelector('[data-midi="60"]')!;
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
    expect(s.held()).toEqual([60]);
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    expect(s.held()).toEqual([]);
    detach();
    root.remove();
  });
});

describe('Web MIDI', () => {
  it('parses note on, note off and sustain', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({
      type: 'on',
      note: 60,
      velocity: 100 / 127,
    });
    expect(parseMidiMessage([0x91, 60, 0])).toEqual({ type: 'off', note: 60 });
    expect(parseMidiMessage([0x80, 60, 40])).toEqual({ type: 'off', note: 60 });
    expect(parseMidiMessage([0xb0, 64, 127])).toEqual({ type: 'sustain', down: true });
    expect(parseMidiMessage([0xf8])).toBeNull();
  });

  it('feeds the note stream', () => {
    const s = new NoteStream();
    const midi = new WebMidiInput(s);
    midi.handle('dev', [0x90, 62, 90]);
    expect(s.held()).toEqual([62]);
    midi.handle('dev', [0x80, 62, 0]);
    expect(s.held()).toEqual([]);
    expect(midi.state.status).toBe('unsupported'); // jsdom has no Web MIDI
  });
});

describe('stuck-note safety', () => {
  function keyboard() {
    const s = new NoteStream();
    const root = document.createElement('div');
    root.innerHTML = '<div data-midi="60"></div><div data-midi="62"></div>';
    document.body.append(root);
    const detach = bindPointerInput(root, s);
    const press = (midi: number, pointerId: number) =>
      root
        .querySelector(`[data-midi="${midi}"]`)!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId }));
    return { s, root, press, cleanup: () => (detach(), root.remove()) };
  }

  it('pointercancel releases the note (browser took the gesture to scroll)', () => {
    const k = keyboard();
    k.press(60, 1);
    k.root.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    expect(k.s.held()).toEqual([]);
    k.cleanup();
  });

  it('lostpointercapture releases only that pointer', () => {
    const k = keyboard();
    k.press(60, 1);
    k.press(62, 2);
    k.root.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }));
    expect(k.s.held()).toEqual([62]);
    k.cleanup();
  });

  it('window blur releases every held pointer note', () => {
    const k = keyboard();
    k.press(60, 1);
    k.press(62, 2);
    window.dispatchEvent(new Event('blur'));
    expect(k.s.held()).toEqual([]);
    k.cleanup();
  });

  it('unbinding (leaving the page) releases held notes', () => {
    const k = keyboard();
    k.press(60, 1);
    k.cleanup();
    expect(k.s.held()).toEqual([]);
  });

  it('computer keys release when the page is hidden', () => {
    const s = new NoteStream();
    const k = new ComputerKeys(s);
    const detach = k.attach(window);
    window.dispatchEvent(key('keydown', 'KeyA'));
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.held()).toEqual([]);
    vis.mockRestore();
    // The key-up that arrives later is ignored, not double-released.
    window.dispatchEvent(key('keyup', 'KeyA'));
    expect(s.held()).toEqual([]);
    detach();
  });

  it('a MIDI device disconnecting releases its notes and its sustain pedal', () => {
    const s = new NoteStream();
    const midi = new WebMidiInput(s);
    const input = { id: 'kbd', name: 'Keys', state: 'connected', onmidimessage: null as unknown };
    const inputs = new Map([['kbd', input]]);
    const access = { inputs, onstatechange: null as null | (() => void) };
    midi.useAccess(access as unknown as MIDIAccess);
    const send = (data: number[]) =>
      (input.onmidimessage as (e: { data: Uint8Array }) => void)({ data: new Uint8Array(data) });
    send([0x90, 60, 100]);
    send([0x90, 64, 100]);
    send([0xb0, 64, 127]);
    expect(s.held()).toEqual([60, 64]);
    expect(midi.state.sustain).toBe(true);
    input.state = 'disconnected';
    access.onstatechange!();
    expect(s.held()).toEqual([]);
    expect(midi.state.sustain).toBe(false);
    expect(midi.state.devices).toEqual([]);
  });
});
