import { BUILT_IN_ENTRIES } from '@/content/builtInIndex';
import { FILLS } from '@/content/fills';
import { PROGRESSIONS } from '@/content/progressions';
import { ChordWave } from '@/ui/art/ChordWave';
import { FillRun } from '@/ui/art/FillRun';
import { MiniKeys } from '@/ui/art/MiniKeys';
import { TWINKLE } from '@/ui/art/previews';
import type { Room } from '@/ui/art/rooms';
import { StaffBars } from '@/ui/art/StaffBars';
import { SungToNotes } from '@/ui/art/SungToNotes';
import { VoiceLines } from '@/ui/art/VoiceLines';
import { WeekDots } from '@/ui/art/WeekDots';
import { FIRST_SONG } from '../progress/catalog';

/** The Songs room draws the welcome song's opening, as the built-in index has it. */
const FIRST_PREVIEW = BUILT_IN_ENTRIES.find((e) =>
  e.levels.some((l) => l.id === FIRST_SONG),
)?.preview;

const II_V_I = PROGRESSIONS.find((p) => p.id === 'ii-v-i');
const RUN_UP = FILLS.find((f) => f.id === 'run-up');

/**
 * Each of Home's rooms drawn from what it holds. Home loads this on its own,
 * after the page, so the fill realiser and the voice leading stay out of what
 * the first screen costs; each card's panel keeps its height meanwhile.
 */
export function RoomArt({
  room,
  week,
}: {
  room: Room;
  week: { key: string; practised: boolean }[];
}) {
  switch (room) {
    case 'songs':
      return FIRST_PREVIEW ? <StaffBars preview={FIRST_PREVIEW} /> : null;
    case 'chords':
      return <MiniKeys notes={[60, 64, 67, 71]} below={1} octaves={3} />;
    case 'progressions':
      return II_V_I ? (
        <VoiceLines numerals={II_V_I.steps.map((s) => s.numeral)} mode={II_V_I.mode} width={220} />
      ) : null;
    case 'fills':
      return RUN_UP ? <FillRun fill={RUN_UP} /> : null;
    case 'ear':
      return <ChordWave notes={[60, 64, 67]} width={250} />;
    case 'studio':
      return <SungToNotes preview={TWINKLE} />;
    case 'progress':
      return <WeekDots days={week} />;
  }
}
