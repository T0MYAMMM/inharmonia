import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { Button, type ButtonProps } from '@/ui/Button';
import { TextInput, type TextInputProps } from '@/ui/TextInput';
import { RedoIcon, UndoIcon } from './icons';
import styles from './editorHeader.module.css';

export interface EditorHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Back, then the title. */
  start: ReactNode;
  /** ToolGroups. */
  tools: ReactNode;
}

/**
 * The top row of a Studio editor: back and the title on the left, the tools
 * on the right. When the row is too narrow the tools move under it as one
 * block, still on the right, so they never split.
 */
export function EditorHeader({ start, tools, className, ...rest }: EditorHeaderProps) {
  return (
    <div className={[styles.header, className].filter(Boolean).join(' ')} {...rest}>
      <div className={styles.start}>{start}</div>
      <div className={styles.tools}>{tools}</div>
    </div>
  );
}

/**
 * Tools that belong together, set off from the group before by a line. A
 * group of one tool, like a menu button, needs no label.
 */
export function ToolGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className={styles.group}>
      {children}
    </div>
  );
}

/** The document's name. Its label is for screen readers; the box shows what it is. */
export function EditorTitle(props: Omit<TextInputProps, 'id'>) {
  const id = useId();
  return (
    <span className={styles.title}>
      <label htmlFor={id} className="visually-hidden">
        Title
      </label>
      <TextInput id={id} placeholder="Untitled" maxLength={80} {...props} />
    </span>
  );
}

export interface UndoRedoProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function UndoRedo({ canUndo, canRedo, onUndo, onRedo }: UndoRedoProps) {
  return (
    <ToolGroup label="History">
      <Button icon aria-label="Undo" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
        <UndoIcon />
      </Button>
      <Button
        icon
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        onClick={onRedo}
        disabled={!canRedo}
      >
        <RedoIcon />
      </Button>
    </ToolGroup>
  );
}

export interface PlayButtonProps extends Omit<ButtonProps, 'children'> {
  playing: boolean;
  /** What it says while playing: Pause, or Stop. */
  stopLabel: string;
}

/** Play, as wide as its other label, so the row doesn't move when it changes. */
export function PlayButton({ playing, stopLabel, ...rest }: PlayButtonProps) {
  return (
    <Button variant="primary" {...rest}>
      <span className={styles.swap}>
        <span>{playing ? stopLabel : 'Play'}</span>
        <span aria-hidden="true">{playing ? 'Play' : stopLabel}</span>
      </span>
    </Button>
  );
}
