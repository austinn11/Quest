import { PlayerAccount } from '../auth/PlayerAccount';
import { PageHeading } from '../ui/PageHeading';

export function ProfilePage() {
  return <><PageHeading title="Player Profile" /><PlayerAccount /></>;
}
