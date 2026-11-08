import { Link } from 'react-router';
import { usePlayer } from '../player/PlayerProvider';
import { PlayerProgress } from '../player/PlayerProgress';
import { useQuestboard } from '../questboard/QuestboardProvider';
import { ArrowRightIcon, CategoryIcon } from '../ui/icons';

function greeting(hour: number) {
  return hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const { player, ready } = usePlayer();
  const { slots, templates, completions, hasSnapshot } = useQuestboard();
  const catalogue = new Map(templates.map(template => [template.templateId, template]));
  const open = [...slots]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .filter(slot => slot.status.tag === 'Available')
    .flatMap(slot => {
      const template = catalogue.get(slot.templateId);
      return template ? [{ slot, template }] : [];
    });
  const [next, ...waiting] = open;
  const username = ready ? player?.username : undefined;

  return (
    <>
      <header className="page-heading visually-hidden"><h1>Dashboard</h1></header>
      <section className="dashboard-next" aria-labelledby="next-quest-title">
        <p>{greeting(new Date().getHours())}, {username || 'adventurer'}.</p>
        {!hasSnapshot ? (
          <p id="next-quest-title" role="status">Gathering your quests...</p>
        ) : next ? (
          <>
            <h2 id="next-quest-title" className="next-quest-title">{next.template.title}</h2>
            <p className="next-quest-objective">{next.template.description}</p>
            <div className="next-quest-actions">
              <Link className="button-link" to={`/questboard#quest-slot-${next.slot.slotIndex}`}>Take this quest</Link>
              <p>
                {next.slot.difficulty.tag}
                {next.template.locationName ? ` · ${next.template.locationName}` : ''} · {next.template.category.tag} · {next.template.xpReward} XP
              </p>
            </div>
          </>
        ) : (
          <>
            <h2 id="next-quest-title" className="next-quest-title">{slots.length ? 'Every quest is done. Rest well.' : 'Your board is being prepared.'}</h2>
            <p className="next-quest-objective">{slots.length ? 'New quests will appear here when your slots refresh.' : 'Your six adventures will appear here shortly.'}</p>
          </>
        )}
        <div className="dashboard-links">
          <Link to="/map">Open the world map <ArrowRightIcon /></Link>
          <Link to="/journal">Read your journal ({completions.length} {completions.length === 1 ? 'entry' : 'entries'}) <ArrowRightIcon /></Link>
          {ready && !player?.username && <Link to="/profile">Pick an adventurer name <ArrowRightIcon /></Link>}
        </div>
      </section>

      {hasSnapshot && (
        <section className="dashboard-waiting" aria-labelledby="waiting-title">
          <div className="section-heading">
            <h2 id="waiting-title">Also waiting</h2>
            <Link to="/questboard">See all {open.length}</Link>
          </div>
          {waiting.length ? (
            <ul className="quest-list">
              {waiting.slice(0, 3).map(({ slot, template }) => (
                <li key={slot.slotId}>
                  <Link to={`/questboard#quest-slot-${slot.slotIndex}`}>
                    <CategoryIcon category={template.category.tag} className="icon-lg" />
                    <span className="quest-list-text"><span className="quest-list-title">{template.title}</span><span>{slot.difficulty.tag}</span></span>
                    <span>{template.xpReward} XP</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p>Nothing else on the board right now.</p>}
        </section>
      )}

      <section className="level-section" aria-label="Adventurer progression"><PlayerProgress /></section>
    </>
  );
}
