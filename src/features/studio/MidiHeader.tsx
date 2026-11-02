import { useId, type ReactNode } from 'react';
import { BREAKPOINTS, useMediaQuery } from '@/app/hooks';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Menu, MenuItem, MenuSeparator } from '@/ui/Menu';
import { NumberInput } from '@/ui/NumberInput';
import { PlayButton } from '@/ui/PlayButton';
import { RangeInput } from '@/ui/RangeInput';
import { Select } from '@/ui/Select';
import { useFileDrop } from '@/ui/useFileDrop';
import { EditorHeader, EditorTitle, ToolGroup, UndoRedo } from './EditorHeader';
import { ChevronDownIcon, MoreIcon, PianoIcon, ZoomPitchIcon, ZoomTimeIcon } from './icons';
import { MIDI_ACCEPT } from './midiFiles';
import { ROW_RANGE, SNAPS, ZOOM_RANGE } from './midiSettings';
import styles from './midiHeader.module.css';

export interface MidiHeaderProps {
  title: string;
  onTitle: (title: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  playing: boolean;
  onPlay: () => void;
  showKeys: boolean;
  onShowKeys: (show: boolean) => void;
  onNew: () => void;
  /** Open the file chooser. */
  onOpen: () => void;
  /** A MIDI file dropped on the File button. */
  onDropFile: (file: File) => void;
  /** A file dropped on the File button that isn't MIDI. */
  onRefuse: () => void;
  onExport: () => void;
  onSave: () => void;
}

/**
 * The workspace's top row: the title, then history, playback, file and save.
 * Below 960px Keyboard is its icon; below 760px the row keeps the title,
 * Play and Keyboard, and puts the rest under More (⋯). The way back to Studio
 * is the page's crumb.
 */
export function MidiHeader(props: MidiHeaderProps) {
  // Below the medium breakpoint the tools fold into More; below the wide one
  // Keyboard is its icon and the groups sit closer, so the title shares a row.
  const compact = useMediaQuery(BREAKPOINTS.medium);
  const narrow = useMediaQuery(BREAKPOINTS.wide);
  const { over, dropProps } = useFileDrop({
    accept: MIDI_ACCEPT,
    onFiles: ([file]) => file && props.onDropFile(file),
    onReject: props.onRefuse,
  });

  const fileItems = (
    <>
      <MenuItem onSelect={props.onNew} data-testid="midi-new">
        New MIDI
      </MenuItem>
      <MenuItem onSelect={props.onOpen} data-testid="midi-open">
        Open MIDI file
      </MenuItem>
      <MenuItem onSelect={props.onExport} data-testid="midi-export">
        Export .mid
      </MenuItem>
    </>
  );
  const playback = (
    <ToolGroup label="Playback">
      <PlayButton
        playing={props.playing}
        stopLabel="Pause"
        onClick={props.onPlay}
        data-testid="midi-play"
      />
      <Button
        icon={narrow}
        className={styles.pressed}
        aria-label={narrow ? 'Keyboard' : undefined}
        aria-pressed={props.showKeys}
        onClick={() => props.onShowKeys(!props.showKeys)}
        title="Play notes into the current track on an on-screen, computer or MIDI keyboard"
        data-testid="midi-keyboard-toggle"
      >
        <PianoIcon />
        {narrow ? null : 'Keyboard'}
      </Button>
    </ToolGroup>
  );

  let tools: ReactNode;
  if (compact) {
    tools = (
      <>
        {playback}
        <ToolGroup>
          <Menu label={<MoreIcon />} aria-label="More" icon align="end" data-testid="midi-more">
            <MenuItem onSelect={props.onUndo} disabled={!props.canUndo}>
              Undo
            </MenuItem>
            <MenuItem onSelect={props.onRedo} disabled={!props.canRedo}>
              Redo
            </MenuItem>
            <MenuSeparator />
            {fileItems}
            <MenuSeparator />
            <MenuItem onSelect={props.onSave} data-testid="midi-save-song">
              Save to Your songs
            </MenuItem>
          </Menu>
        </ToolGroup>
      </>
    );
  } else {
    tools = (
      <>
        <UndoRedo
          canUndo={props.canUndo}
          canRedo={props.canRedo}
          onUndo={props.onUndo}
          onRedo={props.onRedo}
        />
        {playback}
        <ToolGroup label="File">
          <Menu
            label={
              <>
                File <ChevronDownIcon />
              </>
            }
            align="end"
            className={styles.fileMenu}
            data-over={over || undefined}
            data-testid="midi-file-menu"
            {...dropProps}
          >
            {fileItems}
          </Menu>
          <Button onClick={props.onSave} data-testid="midi-save-song">
            Save to Your songs
          </Button>
        </ToolGroup>
      </>
    );
  }

  return (
    <EditorHeader
      data-testid="midi-header"
      dense={narrow}
      start={<EditorTitle value={props.title} onChange={(e) => props.onTitle(e.target.value)} />}
      tools={tools}
    />
  );
}

export interface MidiSettingsProps {
  tempo: number;
  onTempo: (bpm: number) => void;
  /** Snap, in beats; 0 is off. */
  step: number;
  onStep: (beats: number) => void;
  zoom: number;
  onZoom: (px: number) => void;
  row: number;
  onRow: (px: number) => void;
  /** Like "4/4". */
  meter: string;
  notes: number;
}

/**
 * The second row: the song's settings on the left, the view on the right.
 * Below 760px they fold into one line that opens.
 */
export function MidiSettings(props: MidiSettingsProps) {
  const compact = useMediaQuery(BREAKPOINTS.medium);
  const viewId = useId();
  const count = `${props.meter} · ${props.notes} note${props.notes === 1 ? '' : 's'}`;
  const snap = SNAPS.find((s) => s.beats === props.step)?.label ?? '';
  const fields = (
    <>
      <div role="group" aria-label="Song settings" className={styles.song}>
        <Field label="Tempo" inline>
          <NumberInput
            size="small"
            min={20}
            max={300}
            value={props.tempo}
            onChange={props.onTempo}
          />
        </Field>
        <Field label="Snap" inline>
          <Select
            size="small"
            value={props.step}
            onChange={(e) => props.onStep(Number(e.target.value))}
          >
            {SNAPS.map((s) => (
              <option key={s.beats} value={s.beats}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        {/* Folded, the summary says it. */}
        {compact ? null : <span className={styles.count}>{count}</span>}
      </div>
      <div role="group" aria-labelledby={viewId} className={styles.view}>
        <span id={viewId} className={styles.viewLabel}>
          View
        </span>
        <label className={styles.zoom} title="Horizontal zoom">
          <ZoomTimeIcon />
          <RangeInput
            size="small"
            className={styles.zoomRange}
            min={ZOOM_RANGE.min}
            max={ZOOM_RANGE.max}
            step={4}
            value={props.zoom}
            aria-label="Horizontal zoom"
            onChange={props.onZoom}
          />
        </label>
        <label className={styles.zoom} title="Vertical zoom">
          <ZoomPitchIcon />
          <RangeInput
            size="small"
            className={styles.zoomRange}
            min={ROW_RANGE.min}
            max={ROW_RANGE.max}
            step={2}
            value={props.row}
            aria-label="Vertical zoom"
            onChange={props.onRow}
          />
        </label>
      </div>
    </>
  );

  if (compact)
    return (
      <details className={styles.fold} data-testid="midi-settings">
        <summary className={styles.summary}>
          <span className={styles.summaryText}>
            Tempo {props.tempo} · Snap {snap} · {count}
          </span>
          <ChevronDownIcon />
        </summary>
        <div className={styles.foldBody}>{fields}</div>
      </details>
    );
  return (
    <div className={styles.settings} data-testid="midi-settings">
      {fields}
    </div>
  );
}
