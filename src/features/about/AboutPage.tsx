import styles from '../page.module.css';

export function AboutPage() {
  return (
    <div className={styles.prose}>
      <div className={styles.hero} style={{ marginBottom: 0 }}>
        <h1>About Inharmonia</h1>
        <p className={styles.lede}>
          A practice room for piano harmony, built to be calm, clear and kind to your ears.
        </p>
      </div>

      <h2>How it works</h2>
      <ul className={styles.list}>
        <li>
          Play with the on-screen keys, your computer keyboard or a MIDI keyboard (Chrome, Edge and
          other browsers with Web MIDI). Nothing needs installing.
        </li>
        <li>
          Your settings, progress and the progressions you write are kept in this browser only.
          There are no accounts and nothing is sent anywhere. You can export your progressions from
          the Progressions page and clear your progress on the Progress page.
        </li>
        <li>
          After the first visit the whole app, piano included, works offline. On a phone or desktop
          browser that supports it you can add it to your home screen or install it.
        </li>
      </ul>

      <h2>Keys and shortcuts</h2>
      <ul className={styles.list}>
        <li>
          <kbd>A</kbd> to <kbd>&apos;</kbd> play C4 to F5, with the black keys on the row above (
          <kbd>W</kbd>, <kbd>E</kbd>, <kbd>T</kbd>…). <kbd>Z</kbd> and <kbd>X</kbd> shift down and
          up an octave.
        </li>
        <li>
          <kbd>Space</kbd> plays and pauses in the song, progression and fill players.
        </li>
        <li>
          In ear training, number keys pick an answer and <kbd>Enter</kbd> moves on.
        </li>
        <li>Every control works with Tab, arrow keys and Enter, and with a screen reader.</li>
      </ul>

      <h2>Piano sound</h2>
      <p>
        The piano is the <strong>Salamander Grand Piano</strong> by Alexander Holm, a Yamaha C5
        recorded and released under the{' '}
        <a
          href="https://creativecommons.org/licenses/by/3.0/"
          rel="license noopener"
          target="_blank"
        >
          Creative Commons Attribution 3.0
        </a>{' '}
        license. Inharmonia uses a subset of the samples (one every minor third) taken from the{' '}
        <a href="https://github.com/Tonejs/audio" rel="noopener" target="_blank">
          Tone.js audio repository
        </a>
        , trimmed and re-encoded to load quickly.
      </p>

      <h2>Built with</h2>
      <ul className={styles.list}>
        <li>
          <a href="https://tonejs.github.io/" rel="noopener" target="_blank">
            Tone.js
          </a>{' '}
          for the sampler and audio graph
        </li>
        <li>
          <a href="https://github.com/tonaljs/tonal" rel="noopener" target="_blank">
            Tonal
          </a>{' '}
          for music theory
        </li>
        <li>
          <a href="https://vite-pwa-org.netlify.app/" rel="noopener" target="_blank">
            Vite PWA
          </a>{' '}
          and Workbox for working offline
        </li>
        <li>
          <a
            href="https://fonts.google.com/specimen/Bricolage+Grotesque"
            rel="noopener"
            target="_blank"
          >
            Bricolage Grotesque
          </a>{' '}
          by Mathieu Triay, under the SIL Open Font License
        </li>
      </ul>

      <h2>Music</h2>
      <p>
        Every exercise, progression, fill and melody here is original or generic theory material.
        Senja di Teras is an original piece written for Inharmonia, and the fills were written for
        it too. Progressions are named for how they sound, not for songs that use them.
      </p>
    </div>
  );
}
