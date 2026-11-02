import { Link } from 'react-router';
import { RestSpot } from '@/ui/art/spots';
import { buttonClass } from '@/ui/buttonClass';
import { PageHeader } from '../PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Nothing here."
        lede="That page does not exist, or it has moved."
        actions={
          <Link to="/" className={buttonClass('secondary', 'small')}>
            Back to the practice room
          </Link>
        }
      />
      <RestSpot width={300} />
    </>
  );
}
