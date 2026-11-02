import { useState } from 'react';
import { Link } from 'react-router';
import { BUILT_IN_ENTRIES } from '@/content/builtInIndex';
import { SONG_LEVELS, type SongLevel } from '@/core/content/types';
import { slugify } from '@/core/format/write';
import { keyName, prettyAccidentals } from '@/core/notation';
import { useCatalogue } from '@/state/catalogue';
import { useMySongs } from '@/state/mySongs';
import { download } from '@/state/transfer';
import { BetaBadge } from '@/ui/BetaBadge';
import { Button } from '@/ui/Button';
import { Checkbox } from '@/ui/Checkbox';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Select';
import { TextInput } from '@/ui/TextInput';
import page from '../page.module.css';
import { PageHeader } from '../PageHeader';
import { LEVEL_NAMES } from '../song/credit';
import { composeFile, type ComposeCredit } from './composeFile';
import styles from './compose.module.css';

const GUIDE = 'https://github.com/T0MYAMMM/inharmonia/blob/main/docs/composing.md';

/** What a composer agrees to, word for word as in the pull request checklist. */
export const RIGHTS =
  'You own this arrangement, or it is public domain, and you allow Inharmonia to distribute it free in the app; you keep your copyright.';

const NO_CREDIT: Record<ComposeCredit['kind'], ComposeCredit> = {
  original: { kind: 'original', author: '' },
  'public-domain': {
    kind: 'public-domain',
    composer: '',
    composerDied: '',
    firstPublished: '',
    edition: '',
    editor: '',
    editorDied: '',
  },
};

/**
 * For composers invited to the catalogue, and not linked from the app: put
 * the versions made in Studio together as one catalogue file, checked live by
 * the rules CI runs, and download it to send in.
 */
export function ComposePage() {
  const { status, songs } = useMySongs();
  const listed = useCatalogue();
  const [picked, setPicked] = useState<Partial<Record<SongLevel, string>>>({});
  const [title, setTitle] = useState('');
  const [piece, setPiece] = useState('');
  const [pieceEdited, setPieceEdited] = useState(false);
  const [summary, setSummary] = useState('');
  const [credit, setCredit] = useState<ComposeCredit>(NO_CREDIT.original);
  const [agreed, setAgreed] = useState(false);
  const [said, setSaid] = useState('');

  const pieceId = pieceEdited ? piece : title.trim() ? slugify(title) : '';
  const chosen = Object.fromEntries(
    SONG_LEVELS.flatMap((l) => {
      const song = songs.find((s) => s.id === picked[l]);
      return song ? [[l, song]] : [];
    }),
  );
  const file = composeFile({ title, piece: pieceId, summary, credit, songs: chosen });
  const issues = [...file.issues, ...(agreed ? [] : ['Confirm the rights, above.'])];
  const ready = file.text !== null && agreed;
  const existing = [...BUILT_IN_ENTRIES, ...listed.entries].find((e) => e.piece === pieceId);
  const setCreditField = (k: string, v: string) =>
    setCredit((c) => ({ ...c, [k]: v }) as ComposeCredit);

  return (
    <>
      <PageHeader
        crumb={{ to: '/songs', label: 'Songs' }}
        title="Compose for the catalogue"
        tags={<BetaBadge />}
        lede="For composers invited to add songs to Inharmonia. Make each version in Studio and save it, then put them together here as one file to send in."
      />
      <div className={styles.form}>
        <section className={styles.part} aria-labelledby="compose-versions">
          <h2 id="compose-versions">The versions</h2>
          <p className={page.muted}>
            Each version is a song in Your songs, made in Studio. One is enough; Easy, Medium and
            Advanced let people grow into it.
          </p>
          {status === 'ready' && songs.length === 0 ? (
            <p className={styles.empty}>
              Nothing in Your songs yet. <Link to="/studio">Make each version in Studio</Link> and
              save it, then come back.
            </p>
          ) : null}
          <div className={styles.fields}>
            {SONG_LEVELS.map((level) => (
              <Field key={level} label={LEVEL_NAMES[level]}>
                <Select
                  value={picked[level] ?? ''}
                  onChange={(e) => setPicked((p) => ({ ...p, [level]: e.target.value }))}
                  data-testid={`compose-${level}`}
                >
                  <option value="">None</option>
                  {songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.lesson.title}: {prettyAccidentals(keyName(s.lesson.key))},{' '}
                      {s.lesson.bars.length} bars
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </section>

        <section className={styles.part} aria-labelledby="compose-about">
          <h2 id="compose-about">About it</h2>
          <div className={styles.fields}>
            <Field label="Title">
              <TextInput
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="compose-title"
              />
            </Field>
            <Field
              label="Piece id"
              hint="The file's name: lowercase letters, digits and dashes. Each version's id adds its level."
            >
              <TextInput
                value={pieceId}
                maxLength={60}
                onChange={(e) => {
                  setPieceEdited(true);
                  setPiece(e.target.value);
                }}
                data-testid="compose-piece"
              />
            </Field>
            <Field
              label="Summary"
              hint="One line for the song's card, up to 140 characters."
              className={styles.wide}
            >
              <TextInput
                value={summary}
                maxLength={140}
                onChange={(e) => setSummary(e.target.value)}
                data-testid="compose-summary"
              />
            </Field>
          </div>
          {existing ? (
            <p className={styles.note} data-testid="compose-existing">
              {existing.title} already has this id, so your file would replace it. Say so when you
              send it in.
            </p>
          ) : null}
        </section>

        <section className={styles.part} aria-labelledby="compose-credit">
          <h2 id="compose-credit">Credit</h2>
          <Field label="Whose piece" group>
            <Segmented<ComposeCredit['kind']>
              label="Whose piece"
              value={credit.kind}
              options={[
                { value: 'original', label: 'Your own' },
                { value: 'public-domain', label: 'Public domain' },
              ]}
              onChange={(k) => setCredit(NO_CREDIT[k])}
            />
          </Field>
          {credit.kind === 'original' ? (
            <div className={styles.fields}>
              <Field label="Composer" hint="Your name as it goes on the card.">
                <TextInput
                  value={credit.author}
                  maxLength={80}
                  onChange={(e) => setCreditField('author', e.target.value)}
                  data-testid="compose-author"
                />
              </Field>
            </div>
          ) : (
            <>
              <p className={page.muted}>
                A public-domain piece goes in only if everyone whose work it uses died at least 70
                full years ago and it was first published at least 96 years ago. Take the notes from
                an early edition, never from a modern one&apos;s additions.
              </p>
              <div className={styles.fields}>
                <Field label="Composer" hint="Leave it blank for a traditional tune.">
                  <TextInput
                    value={credit.composer}
                    maxLength={80}
                    onChange={(e) => setCreditField('composer', e.target.value)}
                  />
                </Field>
                <Field label="Composer died" hint="The year.">
                  <TextInput
                    inputMode="numeric"
                    value={credit.composerDied}
                    maxLength={4}
                    onChange={(e) => setCreditField('composerDied', e.target.value)}
                  />
                </Field>
                <Field label="First published" hint="The year.">
                  <TextInput
                    inputMode="numeric"
                    value={credit.firstPublished}
                    maxLength={4}
                    onChange={(e) => setCreditField('firstPublished', e.target.value)}
                  />
                </Field>
                <Field label="Edition" hint="The early edition the notes come from, and where.">
                  <TextInput
                    value={credit.edition}
                    maxLength={300}
                    onChange={(e) => setCreditField('edition', e.target.value)}
                  />
                </Field>
                <Field label="Editor" hint="The edition's editor, if it names one.">
                  <TextInput
                    value={credit.editor}
                    maxLength={80}
                    onChange={(e) => setCreditField('editor', e.target.value)}
                  />
                </Field>
                <Field label="Editor died" hint="The year, if known.">
                  <TextInput
                    inputMode="numeric"
                    value={credit.editorDied}
                    maxLength={4}
                    onChange={(e) => setCreditField('editorDied', e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}
        </section>

        <section className={styles.part} aria-labelledby="compose-send">
          <h2 id="compose-send">Download and send it in</h2>
          <Checkbox checked={agreed} onChange={setAgreed} data-testid="compose-rights">
            {RIGHTS}
          </Checkbox>
          {issues.length ? (
            <div className={styles.issues} id="compose-issues">
              <h3>Before it can be downloaded</h3>
              <ul className={page.list} data-testid="compose-issues">
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.ready} id="compose-issues">
              Ready: it passes the same checks the catalogue runs.
            </p>
          )}
          <div className={styles.send}>
            <Button
              variant="primary"
              disabled={!ready}
              aria-describedby="compose-issues"
              onClick={() => {
                download(file.text!, file.fileName);
                setSaid(`Downloaded ${file.fileName}.`);
              }}
              data-testid="compose-download"
            >
              Download {file.fileName}
            </Button>
            <p role="status" className={styles.said}>
              {said}
            </p>
          </div>
          <ol className={page.list}>
            <li>
              <strong>Listen first.</strong> On Songs, under Made by you, Import file brings it in
              to play.
            </li>
            <li>
              <strong>Open a pull request</strong> adding it as public/library/{file.fileName}, and
              run npm run songs. Without npm, say so in the pull request; the owner runs it.
            </li>
            <li>
              <strong>No GitHub?</strong> Send the file to the owner, who opens the pull request for
              you.
            </li>
          </ol>
          <p className={page.muted}>
            The whole guide, with what review checks:{' '}
            <a href={GUIDE} rel="noopener" target="_blank">
              composing for Inharmonia
            </a>
            .
          </p>
        </section>
      </div>
    </>
  );
}
