import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { progressionIssues } from '@/core/content/progressionText';
import { LESSON_SCHEMA_VERSION, type Progression } from '@/core/content/types';
import {
  NAMESPACE,
  readVersioned,
  storage,
  writeVersioned,
  type KeyValueStore,
} from '@/core/persistence/storage';

/** Progressions people write, kept in this browser. */
const KEY = 'user-progressions';
const VERSION = 1;
export const MAX_SAVED = 100;
/** Ids of saved progressions start with this, so they never collide with built-ins. */
export const USER_ID_PREFIX = 'mine-';

/** What the builder hands over: everything but id, schema version and source. */
export interface ProgressionDraft {
  name: string;
  description?: string;
  mode: Progression['mode'];
  steps: Progression['steps'];
}

export interface ImportResult {
  added: number;
  /** Already saved with the same name and chords. */
  duplicates: number;
  /** One line per entry that failed validation. */
  rejected: string[];
}

/** File format for export and import. */
export interface ProgressionFile {
  app: 'inharmonia';
  kind: 'progressions';
  version: number;
  progressions: Progression[];
}

interface UserProgressionsState {
  items: Progression[];
  get(id: string): Progression | undefined;
  /** Save a new progression, or replace the one with `id`. Returns the saved copy. */
  save(draft: ProgressionDraft, id?: string): Progression;
  remove(id: string): void;
  /** Merge progressions from an exported file. */
  importFile(json: string): ImportResult;
  exportFile(): string;
}

/** Keep only the fields we know, trimmed, with source "user". */
function clean(p: Record<string, unknown>, id: string): Progression {
  const description = typeof p.description === 'string' ? p.description.trim() : '';
  return {
    id,
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: (p.name as string).trim(),
    ...(description ? { description } : {}),
    mode: p.mode as Progression['mode'],
    meter: { beats: 4, unit: 4 },
    steps: (p.steps as Progression['steps']).map((s) => ({ numeral: s.numeral, beats: s.beats })),
    source: { kind: 'user' },
  };
}

const sameMusic = (a: Pick<Progression, 'name' | 'mode' | 'steps'>, b: typeof a) =>
  a.name === b.name && a.mode === b.mode && JSON.stringify(a.steps) === JSON.stringify(b.steps);

function slug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'progression'
  );
}

function newId(name: string, taken: (id: string) => boolean, random: () => number): string {
  for (;;) {
    const id = `${USER_ID_PREFIX}${slug(name)}-${Math.floor(random() * 36 ** 4)
      .toString(36)
      .padStart(4, '0')}`;
    if (!taken(id)) return id;
  }
}

/** Read saved progressions, dropping any entry that no longer validates. */
export function loadUserProgressions(store: KeyValueStore = storage): Progression[] {
  const raw = readVersioned<unknown[]>(store, KEY, {
    version: VERSION,
    fallback: [],
    validate: (x): x is unknown[] => Array.isArray(x),
  });
  const seen = new Set<string>();
  const out: Progression[] = [];
  for (const p of raw) {
    if (progressionIssues(p).length) continue;
    const entry = p as Record<string, unknown>;
    const id = entry.id as string;
    if (!id.startsWith(USER_ID_PREFIX) || seen.has(id)) continue;
    seen.add(id);
    out.push(clean(entry, id));
  }
  return out.slice(0, MAX_SAVED);
}

export function createUserProgressionsStore(
  store: KeyValueStore = storage,
  random: () => number = Math.random,
): UseBoundStore<StoreApi<UserProgressionsState>> {
  return create<UserProgressionsState>()((set, get) => {
    const commit = (items: Progression[]) => {
      writeVersioned(store, KEY, VERSION, items);
      set({ items });
    };
    const taken = (id: string) => get().items.some((p) => p.id === id);
    return {
      items: loadUserProgressions(store),
      get: (id) => get().items.find((p) => p.id === id),
      save: (draft, id) => {
        const items = get().items;
        const existing = id ? items.findIndex((p) => p.id === id) : -1;
        if (existing < 0 && items.length >= MAX_SAVED)
          throw new Error(`You can keep up to ${MAX_SAVED} progressions. Delete one to make room.`);
        const finalId = existing >= 0 ? id! : newId(draft.name, taken, random);
        const candidate = { ...draft, id: finalId, meter: { beats: 4, unit: 4 } };
        const issues = progressionIssues(candidate);
        if (issues.length) throw new Error(issues.join(' '));
        const saved = clean(candidate, finalId);
        commit(
          existing >= 0 ? items.map((p, i) => (i === existing ? saved : p)) : [...items, saved],
        );
        return saved;
      },
      remove: (id) => commit(get().items.filter((p) => p.id !== id)),
      importFile: (json) => {
        const result: ImportResult = { added: 0, duplicates: 0, rejected: [] };
        let doc: unknown;
        try {
          doc = JSON.parse(json);
        } catch {
          result.rejected.push("That file isn't JSON.");
          return result;
        }
        const list =
          typeof doc === 'object' &&
          doc !== null &&
          Array.isArray((doc as ProgressionFile).progressions)
            ? (doc as ProgressionFile).progressions
            : null;
        if (!list) {
          result.rejected.push("That file isn't an Inharmonia progressions export.");
          return result;
        }
        const items = [...get().items];
        const isTaken = (id: string) => items.some((p) => p.id === id);
        list.forEach((p: unknown, i) => {
          const label =
            typeof p === 'object' && p !== null && typeof (p as Progression).name === 'string'
              ? `"${(p as Progression).name.slice(0, 60)}"`
              : `Entry ${i + 1}`;
          // Imported ids are replaced, so only the music needs checking.
          const issues = progressionIssues({ ...(p as object), id: 'imported' });
          if (issues.length) {
            result.rejected.push(`${label}: ${issues[0]}`);
            return;
          }
          const entry = p as Record<string, unknown>;
          const probe = clean(entry, 'probe');
          if (items.some((q) => sameMusic(q, probe))) {
            result.duplicates++;
            return;
          }
          if (items.length >= MAX_SAVED) {
            result.rejected.push(`${label}: you already have ${MAX_SAVED} progressions.`);
            return;
          }
          items.push(clean(entry, newId(probe.name, isTaken, random)));
          result.added++;
        });
        if (result.added) commit(items);
        return result;
      },
      exportFile: () => {
        const file: ProgressionFile = {
          app: 'inharmonia',
          kind: 'progressions',
          version: VERSION,
          progressions: get().items,
        };
        return JSON.stringify(file, null, 2);
      },
    };
  });
}

export const useUserProgressions = createUserProgressionsStore();

// Another tab saved or deleted one: pick up its list.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === NAMESPACE + KEY) useUserProgressions.setState({ items: loadUserProgressions() });
  });
