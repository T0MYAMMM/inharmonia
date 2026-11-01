import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ROOMS } from '@/ui/art/rooms';
import { RoomArt } from './RoomArt';

const WEEK = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key, i) => ({ key, practised: i < 3 }));

describe("Home's room drawings", () => {
  it.each(ROOMS.map((r) => [r]))('the %s room draws, hidden from assistive tech', (room) => {
    const { container } = render(<RoomArt room={room} week={WEEK} />);
    const svg = container.firstElementChild;
    expect(svg?.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it("the Songs room draws Twinkle's opening from the built-in index, in 2/4", () => {
    // Three bars of two notes: six quarter notes.
    const { container } = render(<RoomArt room="songs" week={WEEK} />);
    expect(container.querySelectorAll('ellipse')).toHaveLength(6);
    expect([...container.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['2', '4']);
  });
});
