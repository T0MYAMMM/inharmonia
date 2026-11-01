import { Link, useParams } from 'react-router';
import { getSong, versionsOf } from '@/content/lessons';
import { isRetired } from '@/core/library/catalogue';
import { buttonClass } from '@/ui/buttonClass';
import { PageHeader } from '../PageHeader';
import { CatalogueSong } from './CatalogueSong';
import { SongView } from './SongView';

/**
 * A song by its id, wherever it is: built in, downloaded, or in the
 * catalogue (offered for download). A retired piece's id says the piece is
 * gone; any other id is not found.
 */
export function SongPage() {
  const { songId = '' } = useParams();
  const builtIn = getSong(songId);
  if (builtIn)
    return <SongView lesson={builtIn} versions={builtIn.piece ? versionsOf(builtIn.piece) : []} />;
  if (isRetired(songId)) return <RetiredSongPage />;
  return <CatalogueSong key={songId} songId={songId} />;
}

/** An old link to a piece that was taken out. */
function RetiredSongPage() {
  return (
    <PageHeader
      title="This piece is no longer in Inharmonia."
      actions={
        <Link to="/songs" className={buttonClass('secondary', 'small')}>
          Find another in Songs
        </Link>
      }
    />
  );
}
