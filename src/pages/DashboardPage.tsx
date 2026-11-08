import { Link } from 'react-router';
import { usePlayer } from '../player/PlayerProvider';
import { PlayerProgress } from '../player/PlayerProgress';

export function DashboardPage() {
  const { player, ready } = usePlayer();
  return (
    <>
      <header className="page-heading"><h1>Dashboard</h1><p>Welcome{ready && player?.username ? `, ${player.username}` : ', adventurer'}. Your next adventure starts here.</p></header>
      <section className="panel" aria-labelledby="dashboard-progression-title"><h2 id="dashboard-progression-title">Adventurer progression</h2><PlayerProgress /></section>
      <section className="panel" aria-labelledby="start-title">
        <h2 id="start-title">Begin your journey</h2>
        <p>Explore the world, discover available quests, or revisit your personal quest journal.</p>
        <p><Link to="/profile">{ready && player?.username ? 'View your adventurer profile' : 'Set up your adventurer profile'}</Link></p>
      </section>
    </>
  );
}
