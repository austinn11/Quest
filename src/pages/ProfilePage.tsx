import { PlayerAccount } from '../auth/PlayerAccount';

export function ProfilePage() {
  return <><header className="page-heading"><h1>Player Profile</h1><p>Your adventurer identity and progression.</p></header><PlayerAccount /></>;
}
