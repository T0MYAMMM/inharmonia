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
        Every exercise, progression and melody here is original or generic theory material. Senja di
        Teras is an original piece written for Inharmonia.
      </p>
    </div>
  );
}
