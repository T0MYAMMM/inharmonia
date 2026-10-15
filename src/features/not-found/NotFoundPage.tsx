import { Link } from 'react-router';
import styles from '../page.module.css';

export function NotFoundPage() {
  return (
    <div className={styles.hero}>
      <h1>Nothing here.</h1>
      <p className={styles.lede}>That page does not exist, or it has moved.</p>
      <p>
        <Link to="/">Back to the practice room</Link>
      </p>
    </div>
  );
}
