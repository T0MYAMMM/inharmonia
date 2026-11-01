import { useState, type DragEvent } from 'react';

/** Whether a file matches an accept list like ".mid,audio/midi,image/*". */
export function acceptsFile(file: File, accept: string | undefined): boolean {
  if (!accept?.trim()) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .some((a) =>
      a.startsWith('.')
        ? name.endsWith(a)
        : a.endsWith('/*')
          ? type.startsWith(a.slice(0, -1))
          : a === type,
    );
}

export interface FileDropOptions {
  /** Like a file input's accept. Dropped files that don't match are rejected. */
  accept?: string;
  /** Take every matching file, not only the first. */
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  /** The dropped files that don't match `accept`. */
  onReject?: (files: File[]) => void;
}

export interface FileDropProps {
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
}

const hasFiles = (e: DragEvent) => [...e.dataTransfer.items].some((i) => i.kind === 'file');

/**
 * Files dropped on an element: spread `dropProps` on it. `over` is true while
 * files are dragged over it, its children included.
 */
export function useFileDrop({ accept, multiple, disabled, onFiles, onReject }: FileDropOptions): {
  over: boolean;
  dropProps: FileDropProps;
} {
  const [over, setOver] = useState(false);
  if (disabled) return { over: false, dropProps: {} };
  return {
    over,
    dropProps: {
      onDragOver: (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      },
      // Moving onto one of its own children is not leaving.
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const files = [...e.dataTransfer.files];
        const taken = files.filter((f) => acceptsFile(f, accept));
        const rejected = files.filter((f) => !acceptsFile(f, accept));
        if (rejected.length) onReject?.(rejected);
        if (taken.length) onFiles(multiple ? taken : taken.slice(0, 1));
      },
    },
  };
}
